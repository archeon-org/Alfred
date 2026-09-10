import { randomUUID, createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureApplication } from '@api/bootstrap';
import { ApiExceptionFilter } from '@api/common/filters/api-exception.filter';
import { AccessTokenGuard } from '@api/common/guards/access-token.guard';
import { IdempotencyModule } from '@api/common/idempotency/idempotency.module';
import { API_MIGRATIONS_TABLE } from '@api/database/database-options';
import { databaseMigrations } from '@api/database/migrations';
import { databaseEntities } from '@api/database/typeorm.options';
import { ContextResolverService } from '@api/modules/context/application/context-resolver.service';
import { ContextModule } from '@api/modules/context/context.module';
import { ContextDocumentEntity } from '@api/modules/context/infrastructure/context-document.entity';
import { TypeOrmContextRepository } from '@api/modules/context/infrastructure/typeorm-context.repository';
import { ConversationsModule } from '@api/modules/conversations/conversations.module';
import { ProjectEntity } from '@api/modules/projects/infrastructure/persistence/project.entity';
import { ProjectsModule } from '@api/modules/projects/projects.module';
import { TenantEntity } from '@api/modules/tenants/tenant.entity';
import { UserEntity } from '@api/modules/users/user.entity';
import { addWorkspaceMembership, removeTenantWorkspaces } from '../../../support/workspace.fixture';

const databaseUrl = process.env.TEST_DATABASE_URL;
const migrationDatabaseUrl = process.env.TEST_MIGRATION_DATABASE_URL;
const postgres = databaseUrl && migrationDatabaseUrl ? describe : describe.skip;

interface Envelope {
  readonly success: boolean;
  readonly data?: Record<string, unknown> & { items?: Record<string, unknown>[] };
  readonly error?: { readonly code: string };
}

// Runs sequentially with the other PostgreSQL suites: migrations share the public schema.
postgres('context documents PostgreSQL HTTP contract', () => {
  let migration: DataSource;
  let app: INestApplication;
  let db: DataSource;
  let url: string;
  let defaultTenantId: string;
  const createdUsers = new Set<string>();
  const createdTenants = new Set<string>();

  async function tenant(): Promise<string> {
    const id = randomUUID();
    createdTenants.add(id);
    await db
      .getRepository(TenantEntity)
      .insert({ id, name: 'Other tenant', slug: `t-${id.slice(0, 8)}` });
    return id;
  }

  async function user(tenantId = defaultTenantId): Promise<{ id: string; token: string }> {
    const id = randomUUID();
    createdUsers.add(id);
    await db.getRepository(UserEntity).insert({
      displayName: 'Fixture',
      email: `${id}@example.test`,
      id,
      tenantId,
    });
    await addWorkspaceMembership(db, tenantId, id);
    const token = app.get(JwtService).sign({
      email: 'fixture@example.test',
      role: 'user',
      sid: randomUUID(),
      sub: id,
      typ: 'access',
    });
    return { id, token };
  }

  async function api(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    key?: string,
  ): Promise<{ status: number; body: Envelope | null }> {
    const response = await fetch(`${url}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(key === undefined ? {} : { 'idempotency-key': key }),
      },
      method,
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
    const text = await response.text();
    return { body: text === '' ? null : (JSON.parse(text) as Envelope), status: response.status };
  }

  beforeAll(async () => {
    migration = new DataSource({
      entities: [...databaseEntities],
      installExtensions: false,
      migrations: [...databaseMigrations],
      migrationsRun: false,
      migrationsTableName: API_MIGRATIONS_TABLE,
      synchronize: false,
      type: 'postgres',
      url: migrationDatabaseUrl!,
    });
    await migration.initialize();
    await migration.runMigrations({ transaction: 'each' });
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          entities: [...databaseEntities],
          installExtensions: false,
          migrationsRun: false,
          retryAttempts: 0,
          synchronize: false,
          type: 'postgres',
          url: databaseUrl!,
        }),
        JwtModule.register({ secret: 'test-only-postgres-projects-secret' }),
        IdempotencyModule,
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [
            () => ({
              API_PREFIX: 'api',
              TRUST_PROXY_HOPS: 0,
              API_CORS_ORIGINS: ['http://localhost:5173'],
              CONTEXT_DOCUMENT_MAX_BYTES: 65536,
            }),
          ],
        }),
        ContextModule,
        ProjectsModule,
        ConversationsModule,
      ],
      providers: [
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_GUARD, useClass: AccessTokenGuard },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    const address = (app.getHttpServer() as { address(): AddressInfo }).address();
    url = `http://127.0.0.1:${address.port}/api`;
    db = app.get(DataSource);
    defaultTenantId = (await db.getRepository(TenantEntity).findOneByOrFail({ slug: 'default' }))
      .id;
  });

  afterAll(async () => {
    if (db?.isInitialized) {
      for (const id of createdUsers) await db.getRepository(UserEntity).delete(id);
      for (const id of createdTenants) {
        await removeTenantWorkspaces(db, id);
        await db.getRepository(TenantEntity).delete(id);
      }
    }
    await app?.close();
    if (migration?.isInitialized) await migration.destroy();
  });

  async function project(token: string, context?: string) {
    return (
      await api('POST', '/projects', token, {
        name: 'Project',
        ...(context === undefined ? {} : { context }),
      })
    ).body!.data!.id as string;
  }
  async function save(
    token: string,
    content: string,
    expectedRevision: number,
    path = '/context/personal/instructions',
  ) {
    return api('PUT', path, token, { content, expectedRevision });
  }
  function principal(owner: { id: string }) {
    return {
      id: owner.id,
      email: 'fixture@example.test',
      role: 'user' as const,
      sessionId: 'fixture',
    };
  }

  it('is private by default and exposes empty personal settings without creating rows', async () => {
    expect((await api('GET', '/context/personal', '')).status).toBe(401);
    const owner = await user();
    const result = await api('GET', '/context/personal', owner.token);
    expect(result.status).toBe(200);
    expect(result.body?.data).toMatchObject({
      maxBytes: 65536,
      documents: [
        { kind: 'instructions', revision: 0, content: '' },
        { kind: 'preferences', revision: 0, content: '' },
      ],
    });
    expect(await db.getRepository(ContextDocumentEntity).countBy({ userId: owner.id })).toBe(0);
  });

  it('normalizes, persists, hashes and isolates personal content; stale equal writes conflict', async () => {
    const owner = await user();
    const other = await user();
    const initial = await save(owner.token, '  # My rules\r\nKeep spaces  ', 0);
    expect(initial.status).toBe(200);
    expect(initial.body?.data).toMatchObject({
      content: '  # My rules\nKeep spaces  ',
      revision: 1,
      contentHash: createHash('sha256').update('  # My rules\nKeep spaces  ').digest('hex'),
    });
    expect((await save(owner.token, '  # My rules\nKeep spaces  ', 1)).body).toEqual(initial.body);
    expect((await save(owner.token, '  # My rules\nKeep spaces  ', 0)).body?.error?.code).toBe(
      'context_revision_conflict',
    );
    expect(
      (await api('GET', '/context/personal', other.token)).body?.data?.documents,
    ).toMatchObject([
      { content: '', revision: 0 },
      { content: '', revision: 0 },
    ]);
    expect((await save(owner.token, '', 1)).body?.data?.revision).toBe(2);
    expect((await save(owner.token, 'restored', 2)).body?.data?.revision).toBe(3);
  });

  it('allows exactly one concurrent creation and one concurrent update', async () => {
    const owner = await user();
    const created = await Promise.all([save(owner.token, 'A', 0), save(owner.token, 'B', 0)]);
    expect(created.map((x) => x.status).sort()).toEqual([200, 409]);
    const updated = await Promise.all([save(owner.token, 'C', 1), save(owner.token, 'D', 1)]);
    expect(updated.map((x) => x.status).sort()).toEqual([200, 409]);
    expect(await db.getRepository(ContextDocumentEntity).countBy({ userId: owner.id })).toBe(1);
  });

  it('enforces concrete DTOs, kinds, NUL, Unicode and UTF8 bytes', async () => {
    const owner = await user();
    for (const body of [
      null,
      { content: null, expectedRevision: 0 },
      { content: 'x' },
      { content: 'x', expectedRevision: -1 },
      { content: 'x', expectedRevision: '0' },
      { content: 'x', expectedRevision: 0, userId: owner.id },
    ]) {
      expect((await api('PUT', '/context/personal/instructions', owner.token, body)).status).toBe(
        400,
      );
    }
    for (const text of ['\0', '\ud800', 'é'.repeat(32769)])
      expect((await save(owner.token, text, 0)).status).toBe(400);
    expect((await save(owner.token, 'x', 0, '/context/personal/context')).status).toBe(400);
    expect((await save(owner.token, 'é'.repeat(32768), 0)).status).toBe(200);
  });

  it('accepts worst-case escaped JSON at the content limit using production parser', async () => {
    const owner = await user();
    expect((await save(owner.token, '\u0001'.repeat(65536), 0)).status).toBe(200);
    expect((await save(owner.token, 'x'.repeat(400000), 1)).status).toBe(413);
    const malformed = await fetch(`${url}/context/personal/instructions`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
      body: 'PRIVATE_CONTEXT_PAYLOAD',
    });
    expect(malformed.status).toBe(400);
    expect(malformed.headers.get('cache-control')).toBe('no-store');
    expect(await malformed.json()).toMatchObject({
      error: { code: 'HTTP_400', message: 'Invalid JSON body.' },
    });
  });

  it('exposes a configurable lower limit and enforces it server-side', async () => {
    const owner = await user();
    const config = app.get(ConfigService);
    config.set('CONTEXT_DOCUMENT_MAX_BYTES', 4);
    try {
      expect((await api('GET', '/context/personal', owner.token)).body?.data?.maxBytes).toBe(4);
      expect((await save(owner.token, 'éé', 0)).status).toBe(200);
      expect((await save(owner.token, 'ééé', 1)).body?.error?.code).toBe(
        'context_content_too_large',
      );
      expect(
        (await api('POST', '/projects', owner.token, { name: 'Too big', context: '12345' })).status,
      ).toBe(400);
    } finally {
      config.set('CONTEXT_DOCUMENT_MAX_BYTES', 65536);
    }
  });

  it('creates canonical project context and blocks unversioned updates', async () => {
    const owner = await user();
    const id = await project(owner.token, '# Existing\r\nText');
    expect(
      (await api('GET', `/projects/${id}/context-documents`, owner.token)).body?.data?.documents,
    ).toMatchObject([
      { kind: 'context', content: '# Existing\nText', revision: 1 },
      { kind: 'preferences', revision: 0 },
    ]);
    expect(
      (await api('PATCH', `/projects/${id}`, owner.token, { context: 'Bypass' })).body?.error?.code,
    ).toBe('context_revision_required');
    expect(
      (await save(owner.token, 'Updated', 1, `/projects/${id}/context-documents/context`)).status,
    ).toBe(200);
    expect((await api('GET', `/projects/${id}`, owner.token)).body?.data?.context).toBe('Updated');
  });

  it('protects same-tenant and cross-tenant projects and invalid project identifiers', async () => {
    const owner = await user();
    const other = await user();
    const outside = await user(await tenant());
    const id = await project(owner.token);
    for (const token of [other.token, outside.token]) {
      expect((await api('GET', `/projects/${id}/context-documents`, token)).status).toBe(404);
      expect(
        (await save(token, 'attack', 0, `/projects/${id}/context-documents/context`)).status,
      ).toBe(404);
    }
    expect((await api('GET', '/projects/not-a-uuid/context-documents', owner.token)).status).toBe(
      404,
    );
    expect(
      (await save(owner.token, 'x', 0, `/projects/${id}/context-documents/instructions`)).status,
    ).toBe(400);
  });

  it('rejects archived/deleting project writes and inactive personal accounts', async () => {
    const owner = await user();
    const id = await project(owner.token);
    for (const status of ['archived', 'deleting'] as const) {
      await db.getRepository(ProjectEntity).update(id, { status });
      expect(
        (await save(owner.token, 'x', 0, `/projects/${id}/context-documents/context`)).body?.error
          ?.code,
      ).toBe(`project_${status}`);
    }
    await db.getRepository(UserEntity).update(owner.id, { status: 'disabled' });
    expect((await api('GET', '/context/personal', owner.token)).status).toBe(401);
  });

  it('resolves four typed sources and changes scope fingerprint after transfer', async () => {
    const owner = await user();
    const other = await user();
    const chat = (await api('POST', '/conversations', owner.token, {})).body!.data as {
      id: string;
      projectId: string;
    };
    await save(owner.token, 'Global', 0);
    await save(owner.token, 'French', 0, '/context/personal/preferences');
    const id = await project(owner.token, 'Facts');
    await save(owner.token, 'Short', 0, `/projects/${id}/context-documents/preferences`);
    const resolver = app.get(ContextResolverService);
    const before = await resolver.resolve(principal(owner), chat.id);
    expect(before.sources.map((source) => source.plane)).toEqual([
      'directive',
      'directive',
      'evidence',
      'directive',
    ]);
    await expect(resolver.resolve(principal(other), chat.id)).rejects.toMatchObject({
      code: 'conversation_not_found',
    });
    expect(
      (await api('POST', `/conversations/${chat.id}/move`, owner.token, { projectId: id })).status,
    ).toBe(200);
    const after = await resolver.resolve(principal(owner), chat.id);
    expect(after.projectId).toBe(id);
    expect(after.sources.map((source) => source.content)).toEqual([
      'Global',
      'French',
      'Facts',
      'Short',
    ]);
    expect(after.fingerprint).not.toBe(before.fingerprint);
  });

  it('resolves one coherent snapshot while a transfer and preference save commit between source reads', async () => {
    const owner = await user();
    const chat = (await api('POST', '/conversations', owner.token, {})).body!.data as {
      id: string;
      projectId: string;
    };
    const targetId = await project(owner.token, 'New project facts');
    await save(owner.token, 'Before', 0, '/context/personal/preferences');
    const original = Object.getOwnPropertyDescriptor(TypeOrmContextRepository.prototype, 'read')
      ?.value as TypeOrmContextRepository['read'];
    const read = vi
      .spyOn(TypeOrmContextRepository.prototype, 'read')
      .mockImplementationOnce(async function (this: TypeOrmContextRepository, scope, kind) {
        const first = await original.call(this, scope, kind);
        expect((await save(owner.token, 'After', 1, '/context/personal/preferences')).status).toBe(
          200,
        );
        expect(
          (
            await api('POST', `/conversations/${chat.id}/move`, owner.token, {
              projectId: targetId,
            })
          ).status,
        ).toBe(200);
        return first;
      });
    try {
      const snapshot = await app.get(ContextResolverService).resolve(principal(owner), chat.id);
      expect(snapshot.projectId).toBe(chat.projectId);
      expect(snapshot.sources[1]).toMatchObject({ content: 'Before', revision: 1 });
      expect(snapshot.sources[2]).toMatchObject({ scopeId: chat.projectId, content: '' });
    } finally {
      read.mockRestore();
    }
    const next = await app.get(ContextResolverService).resolve(principal(owner), chat.id);
    expect(next.projectId).toBe(targetId);
    expect(next.sources[1]).toMatchObject({ content: 'After', revision: 2 });
    expect(next.sources[2]).toMatchObject({ scopeId: targetId, content: 'New project facts' });
  });

  it('preserves implicit project preferences during transfer and allows transfer after reset', async () => {
    const owner = await user();
    const chat = (await api('POST', '/conversations', owner.token, {})).body!.data as {
      id: string;
      projectId: string;
    };
    const id = await project(owner.token);
    const path = `/projects/${chat.projectId}/context-documents/preferences`;
    expect((await save(owner.token, 'Keep this', 0, path)).status).toBe(200);
    expect(
      (await api('POST', `/conversations/${chat.id}/move`, owner.token, { projectId: id })).body
        ?.error?.code,
    ).toBe('conversation_source_has_context');
    expect((await save(owner.token, '', 1, path)).status).toBe(200);
    expect(
      (await api('POST', `/conversations/${chat.id}/move`, owner.token, { projectId: id })).status,
    ).toBe(200);
    expect(
      await db.getRepository(ContextDocumentEntity).countBy({ projectId: chat.projectId }),
    ).toBe(0);
  });

  it('serializes a context write racing with transfer without losing saved content', async () => {
    const owner = await user();
    const chat = (await api('POST', '/conversations', owner.token, {})).body!.data as {
      id: string;
      projectId: string;
    };
    const id = await project(owner.token);
    const [saved, moved] = await Promise.all([
      save(owner.token, 'Preserve', 0, `/projects/${chat.projectId}/context-documents/preferences`),
      api('POST', `/conversations/${chat.id}/move`, owner.token, { projectId: id }),
    ]);
    expect([
      [200, 409],
      [404, 200],
    ]).toContainEqual([saved.status, moved.status]);
    if (saved.status === 200)
      expect(
        await db.getRepository(ContextDocumentEntity).findOneBy({ projectId: chat.projectId }),
      ).toMatchObject({ content: 'Preserve' });
  });

  it('enforces parent XOR, kind, uniqueness, FK and byte bounds in PostgreSQL', async () => {
    const owner = await user();
    const id = await project(owner.token);
    const repository = db.getRepository(ContextDocumentEntity);
    const base = {
      content: 'x',
      contentHash: '0'.repeat(64),
      revision: 1,
      kind: 'instructions' as const,
    };
    for (const value of [
      { ...base },
      { ...base, userId: owner.id, projectId: id },
      { ...base, projectId: id },
      { ...base, userId: randomUUID() },
      { ...base, userId: owner.id, revision: 0 },
      { ...base, userId: owner.id, content: 'é'.repeat(32769) },
    ]) {
      await expect(repository.insert(value)).rejects.toThrow();
    }
    await repository.insert({ ...base, userId: owner.id });
    await expect(repository.insert({ ...base, userId: owner.id })).rejects.toThrow();
  });

  it('cascades project and account deletion to context documents', async () => {
    const owner = await user();
    const id = await project(owner.token, 'Facts');
    await save(owner.token, 'Prefs', 0, `/projects/${id}/context-documents/preferences`);
    await save(owner.token, 'Global', 0);
    await api('DELETE', `/projects/${id}`, owner.token);
    expect(await db.getRepository(ContextDocumentEntity).countBy({ projectId: id })).toBe(0);
    await db.getRepository(UserEntity).delete(owner.id);
    expect(await db.getRepository(ContextDocumentEntity).countBy({ userId: owner.id })).toBe(0);
  });

  it('keeps TypeORM metadata in parity with the explicitly migrated schema', async () => {
    const log = await db.driver.createSchemaBuilder().log();
    expect(log.upQueries.map((query) => query.query)).toEqual([]);
  });
});
