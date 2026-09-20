import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { expect } from 'vitest';

import { configureApplication } from '@api/bootstrap';
import { ApiExceptionFilter } from '@api/common/filters/api-exception.filter';
import { AccessTokenGuard } from '@api/common/guards/access-token.guard';
import { FileUploadThrottlerGuard } from '@api/common/guards/alfred-throttler.guard';
import { IdempotencyModule } from '@api/common/idempotency/idempotency.module';
import { databaseEntities } from '@api/database/typeorm.options';
import { ContextModule } from '@api/modules/context/context.module';
import { ConversationsModule } from '@api/modules/conversations/conversations.module';
import { FeatureFlagGuard } from '@api/modules/feature-flags/feature-flag.guard';
import { FeatureFlagsModule } from '@api/modules/feature-flags/feature-flags.module';
import { FEATURE_FLAG_ENVIRONMENT_KEYS } from '@api/modules/feature-flags/feature-flags.types';
import { FileCollector } from '@api/modules/files/application/file-collector';
import { FileExtractionWorker } from '@api/modules/files/application/file-extraction.worker';
import {
  ARTIFACT_CONTENT_STORE,
  type ArtifactContentStore,
} from '@api/modules/files/domain/content-store.port';
import { FilesModule } from '@api/modules/files/files.module';
import { ProjectsModule } from '@api/modules/projects/projects.module';
import { TenantEntity } from '@api/modules/tenants/tenant.entity';
import { UserEntity } from '@api/modules/users/user.entity';
import { addWorkspaceMembership } from '../../../support/workspace.fixture';

export interface Envelope {
  readonly success: boolean;
  readonly data?: Record<string, unknown> & { items?: Record<string, unknown>[] };
  readonly error?: { readonly code: string; readonly details?: Record<string, unknown> };
}

export interface FixtureOptions {
  readonly quotaBytes?: number;
  readonly maxFileBytes?: number;
  readonly pendingTtlMs?: number;
  /** `false` starts the same composition with the upload capability switched off. */
  readonly enabled?: boolean;
}

/**
 * Set `TEST_FILE_STORAGE_S3_*` to run these suites against a real S3-compatible server instead
 * of the shared directory: the same product behaviour is then proven over the production adapter.
 */
const s3 = {
  endpoint: process.env.TEST_FILE_STORAGE_S3_ENDPOINT,
  bucket: process.env.TEST_FILE_STORAGE_S3_BUCKET,
  accessKeyId: process.env.TEST_FILE_STORAGE_S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.TEST_FILE_STORAGE_S3_SECRET_ACCESS_KEY,
};
const storage =
  s3.endpoint === undefined || s3.bucket === undefined
    ? {}
    : {
        FILE_STORAGE_S3_ENDPOINT: s3.endpoint,
        FILE_STORAGE_S3_BUCKET: s3.bucket,
        FILE_STORAGE_S3_REGION: process.env.TEST_FILE_STORAGE_S3_REGION ?? 'us-east-1',
        FILE_STORAGE_S3_ACCESS_KEY_ID: s3.accessKeyId,
        FILE_STORAGE_S3_SECRET_ACCESS_KEY: s3.secretAccessKey,
        // Test objects stay apart from whatever else the bucket holds.
        FILE_STORAGE_S3_PREFIX: 'integration-tests',
      };

/**
 * The files module over a real PostgreSQL and a real directory, with extraction run inline.
 *
 * Spec files run in parallel against one database, so their workers share one job queue exactly
 * as API replicas do — and, like replicas, they must then share one store: every fixture uses the
 * same directory, and waits for its own files to settle whichever worker handled them.
 */
export class FilesPostgresFixture {
  app!: INestApplication;
  db!: DataSource;
  url!: string;
  root!: string;
  private readonly users: string[] = [];

  async start(databaseUrl: string, options: FixtureOptions = {}): Promise<void> {
    this.root = join(tmpdir(), 'alfred-files-integration');
    await mkdir(this.root, { recursive: true });
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          entities: [...databaseEntities],
          installExtensions: false,
          migrationsRun: false,
          retryAttempts: 0,
          synchronize: false,
          type: 'postgres',
          url: databaseUrl,
        }),
        JwtModule.register({ secret: 'test-only-postgres-files-secret' }),
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              API_PREFIX: 'api',
              TRUST_PROXY_HOPS: 0,
              API_CORS_ORIGINS: ['http://localhost:5173'],
              ...Object.fromEntries(
                Object.values(FEATURE_FLAG_ENVIRONMENT_KEYS).map((key) => [key, false]),
              ),
              FEATURE_FILE_UPLOADS_ENABLED: options.enabled ?? true,
              CONTEXT_DOCUMENT_MAX_BYTES: 65_536,
              FILE_STORAGE_LOCAL_ROOT: this.root,
              ...storage,
              FILE_UPLOAD_MAX_BYTES: options.maxFileBytes ?? 5_242_880,
              FILE_QUOTA_BYTES_PER_USER: options.quotaBytes ?? 26_214_400,
              FILE_PENDING_UPLOAD_TTL_MS: options.pendingTtlMs ?? 300_000,
              FILE_UPLOAD_MAX_CONCURRENT: 4,
              FILE_EXTRACTION_TIMEOUT_MS: 30_000,
              FILE_EXTRACTION_MAX_PDF_PAGES: 50,
              FILE_EXTRACTED_TEXT_MAX_CHARS: 100_000,
              FILE_IMAGE_MAX_EDGE_PX: 256,
              FILE_IMAGE_MAX_INPUT_PIXELS: 50_000_000,
              FILE_PROMPT_TOKENS_PER_DOCUMENT: 100,
              FILE_PROMPT_TOKENS_PER_EXECUTION: 160,
            }),
          ],
        }),
        IdempotencyModule,
        FeatureFlagsModule,
        ContextModule,
        ProjectsModule,
        ConversationsModule,
        FilesModule,
      ],
      providers: [
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_GUARD, useClass: AccessTokenGuard },
        { provide: APP_GUARD, useClass: FeatureFlagGuard },
      ],
    })
      .overrideGuard(FileUploadThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    this.app = module.createNestApplication({ logger: false });
    configureApplication(this.app);
    await this.app.listen(0, '127.0.0.1');
    const address = (this.app.getHttpServer() as { address(): AddressInfo }).address();
    this.url = `http://127.0.0.1:${address.port}/api`;
    this.db = this.app.get(DataSource);
    await this.purgeStale();
  }

  async close(): Promise<void> {
    try {
      if (this.db?.isInitialized) {
        // Background work stops first: a worker publishing a reduced copy while its owner is
        // being purged would violate the owner foreign key and leak every user after it.
        await this.app.get(FileExtractionWorker).onModuleDestroy();
        await this.app.get(FileCollector).onModuleDestroy();
        for (const id of this.users) {
          // One owner that cannot be purged must not leave all the others behind.
          await this.purge(id).catch(() => undefined);
        }
      }
    } finally {
      await this.app?.close();
    }
  }

  /**
   * Removes one fixture user and the whole library under it, stored objects included. Bytes live
   * outside PostgreSQL, so owners are RESTRICTed: the library goes first.
   */
  private async purge(id: string): Promise<void> {
    const store = this.app.get<ArtifactContentStore>(ARTIFACT_CONTENT_STORE);
    await this.db.query(
      `DELETE FROM "api_message_attachments" WHERE "artifact_id" IN (SELECT "id" FROM "api_artifacts" WHERE "owner_user_id" = $1)`,
      [id],
    );
    await this.db.query(
      `DELETE FROM "api_artifact_extractions" e USING "api_artifact_contents" c WHERE c."id" = e."content_id" AND c."owner_user_id" = $1`,
      [id],
    );
    await this.db.query(
      `UPDATE "api_artifacts" SET "current_revision_id" = NULL WHERE "owner_user_id" = $1`,
      [id],
    );
    await this.db.query(
      `DELETE FROM "api_artifact_revisions" r USING "api_artifacts" a WHERE a."id" = r."artifact_id" AND a."owner_user_id" = $1`,
      [id],
    );
    await this.db.query(`DELETE FROM "api_artifacts" WHERE "owner_user_id" = $1`, [id]);
    // Read before deleting: TypeORM answers a `DELETE … RETURNING` with a `[rows, count]`
    // tuple, and a cleanup that iterates the wrong thing leaks every stored object silently.
    const contents: { id: string }[] = await this.db.query(
      `SELECT "id" FROM "api_artifact_contents" WHERE "owner_user_id" = $1`,
      [id],
    );
    await this.db.query(`DELETE FROM "api_artifact_contents" WHERE "owner_user_id" = $1`, [id]);
    for (const content of contents) await store.delete(content.id);
    await this.db.getRepository(UserEntity).delete(id);
  }

  /**
   * A run interrupted before `close()` leaves its users behind, and their contents then make
   * every other suite's `DELETE FROM "api_users"` fail on the owner foreign key. They are removed
   * here; the age keeps the users of a suite running at the same moment out of reach.
   */
  private async purgeStale(): Promise<void> {
    const stale: { id: string }[] = await this.db.query(
      `SELECT "id" FROM "api_users" WHERE "display_name" = 'Files fixture'
         AND "created_at" < now() - interval '15 minutes'`,
    );
    for (const { id } of stale) await this.purge(id).catch(() => undefined);
  }

  async user(): Promise<{ id: string; token: string }> {
    const id = randomUUID();
    this.users.push(id);
    const tenant = await this.db.getRepository(TenantEntity).findOneByOrFail({ slug: 'default' });
    await this.db.getRepository(UserEntity).insert({
      id,
      tenantId: tenant.id,
      displayName: 'Files fixture',
      email: `${id}@example.test`,
    });
    await addWorkspaceMembership(this.db, tenant.id, id);
    const token = this.app.get(JwtService).sign({
      email: `${id}@example.test`,
      role: 'user',
      sid: randomUUID(),
      sub: id,
      typ: 'access',
    });
    return { id, token };
  }

  async api(
    method: string,
    path: string,
    token: string,
    body?: unknown,
  ): Promise<{ status: number; body: Envelope | null }> {
    const response = await fetch(`${this.url}${path}`, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    });
    const text = await response.text();
    return { status: response.status, body: text === '' ? null : (JSON.parse(text) as Envelope) };
  }

  async upload(
    token: string,
    bytes: Buffer,
    name: string,
    fields: { uploadId?: string; folderId?: string } = {},
  ): Promise<{ status: number; body: Envelope | null }> {
    const form = new FormData();
    form.set('uploadId', fields.uploadId ?? randomUUID());
    if (fields.folderId !== undefined) form.set('folderId', fields.folderId);
    form.set('file', new Blob([new Uint8Array(bytes)]), name);
    const response = await fetch(`${this.url}/files`, {
      method: 'POST',
      body: form,
      headers: { authorization: `Bearer ${token}` },
    });
    const text = await response.text();
    return { status: response.status, body: text === '' ? null : (JSON.parse(text) as Envelope) };
  }

  /** Uploads, asserts acceptance and returns the library entry. */
  async uploaded(token: string, bytes: Buffer, name: string, folderId?: string) {
    const result = await this.upload(
      token,
      bytes,
      name,
      folderId === undefined ? {} : { folderId },
    );
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    return (result.body?.data as { file: Record<string, unknown> & { id: string } }).file;
  }

  /** Runs queued extractions now, then waits until this fixture's own files have all settled. */
  async extractAll(): Promise<void> {
    await this.app.get(FileExtractionWorker).drain();
    await this.settled(
      `SELECT 1 FROM "api_artifact_extractions" e JOIN "api_artifact_contents" c ON c."id" = e."content_id"
       WHERE c."owner_user_id" = ANY($1::uuid[]) AND e."state" IN ('queued', 'running') LIMIT 1`,
    );
  }

  async collect(): Promise<void> {
    await this.app.get(FileCollector).sweep();
    await this.settled(
      `SELECT 1 FROM "api_artifact_contents" WHERE "owner_user_id" = ANY($1::uuid[])
         AND ("state" = 'purging' OR ("state" = 'pending' AND "expires_at" <= now())) LIMIT 1`,
    );
  }

  /**
   * What is left of an upload that never published goes in two steps: the expired reservation
   * ends at the first sweep, and the row leaves with its bytes once the grace period is over.
   * The test does not wait ten minutes: it ages this fixture's own rows.
   */
  async collectAbandoned(): Promise<void> {
    await this.collect();
    await this.db.query(
      `UPDATE "api_artifact_contents" SET "updated_at" = now() - interval '11 minutes'
       WHERE "owner_user_id" = ANY($1::uuid[]) AND "state" = 'failed'`,
      [this.users],
    );
    await this.app.get(FileCollector).sweep();
  }

  /** Runs the queue once, without waiting for jobs a test deliberately left unfinished. */
  async drainExtractions(): Promise<void> {
    await this.app.get(FileExtractionWorker).drain();
  }

  /** Another spec file's worker may hold one of our jobs: poll until none of ours is pending. */
  private async settled(pendingSql: string): Promise<void> {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const pending: unknown[] = await this.db.query(pendingSql, [this.users]);
      if (pending.length === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Background file work did not settle in time');
  }

  get store(): ArtifactContentStore {
    return this.app.get<ArtifactContentStore>(ARTIFACT_CONTENT_STORE);
  }

  /** Whether the bytes of a content identity exist, whichever adapter stores them. */
  stored(contentId: string): Promise<boolean> {
    return this.store.exists(contentId);
  }

  /**
   * Holds every `put` until `callers` of them have arrived, then lets them all through: the
   * deterministic form of "two requests were admitted before either published". Returns the
   * function that restores the store and releases any write still held.
   */
  holdWritesUntil(callers: number): () => void {
    const store = this.store;
    const original = store.put.bind(store);
    let arrived = 0;
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    store.put = async (...parameters: Parameters<ArtifactContentStore['put']>) => {
      arrived += 1;
      if (arrived >= callers) open();
      await gate;
      return original(...parameters);
    };
    return () => {
      store.put = original;
      // Whatever is still held goes through: a test that stops early never hangs a request.
      open();
    };
  }

  async conversation(token: string): Promise<string> {
    const result = await this.api('POST', '/conversations', token, {});
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    return result.body?.data?.id as string;
  }

  async raw(path: string, token: string): Promise<Response> {
    return fetch(`${this.url}${path}`, { headers: { authorization: `Bearer ${token}` } });
  }
}
