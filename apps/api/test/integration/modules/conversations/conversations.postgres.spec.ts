import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { AddConversationPin1789080000000 } from '@api/database/migrations/1789080000000-add-conversation-pin';
import { encodeCursor } from '@api/common/pagination/cursor';
import type { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ApiExceptionFilter } from '@api/common/filters/api-exception.filter';
import { AccessTokenGuard } from '@api/common/guards/access-token.guard';
import { IdempotencyModule } from '@api/common/idempotency/idempotency.module';
import { RequestValidationPipe } from '@api/common/validation/request-validation.pipe';
import { API_MIGRATIONS_TABLE } from '@api/database/database-options';
import { databaseMigrations } from '@api/database/migrations';
import { databaseEntities } from '@api/database/typeorm.options';
import { ConversationsModule } from '@api/modules/conversations/conversations.module';
import { ConversationEntity } from '@api/modules/conversations/infrastructure/persistence/conversation.entity';
import { ProjectsModule } from '@api/modules/projects/projects.module';
import { TenantEntity } from '@api/modules/tenants/tenant.entity';
import { UserEntity } from '@api/modules/users/user.entity';

const databaseUrl = process.env.TEST_DATABASE_URL;
const migrationDatabaseUrl = process.env.TEST_MIGRATION_DATABASE_URL;
if (process.env.REQUIRE_DATABASE_E2E === 'true' && (!databaseUrl || !migrationDatabaseUrl)) {
  throw new Error(
    'REQUIRE_DATABASE_E2E=true requires TEST_DATABASE_URL and TEST_MIGRATION_DATABASE_URL',
  );
}
const postgres = databaseUrl && migrationDatabaseUrl ? describe : describe.skip;

interface Envelope {
  readonly success: boolean;
  readonly data?: Record<string, unknown> & { items?: Record<string, unknown>[] };
  readonly error?: { readonly code: string };
}

// Runs sequentially with the other PostgreSQL suites: migrations share the public schema.
postgres('conversation metadata PostgreSQL HTTP contract', () => {
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
    await db
      .getRepository(UserEntity)
      .insert({ displayName: 'Fixture', email: `${id}@example.test`, id, tenantId });
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
        ProjectsModule,
        ConversationsModule,
      ],
      providers: [
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_GUARD, useClass: AccessTokenGuard },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(new RequestValidationPipe());
    await app.listen(0, '127.0.0.1');
    const address = (app.getHttpServer() as { address(): AddressInfo }).address();
    url = `http://127.0.0.1:${address.port}`;
    db = app.get(DataSource);
    defaultTenantId = (await db.getRepository(TenantEntity).findOneByOrFail({ slug: 'default' }))
      .id;
  });

  afterAll(async () => {
    if (db?.isInitialized) {
      for (const id of createdUsers) await db.getRepository(UserEntity).delete(id);
      for (const id of createdTenants) await db.getRepository(TenantEntity).delete(id);
    }
    await app?.close();
    if (migration?.isInitialized) await migration.destroy();
  });

  it('adds, reverts and restores the nullable pin column without schema drift', async () => {
    const runner = migration.createQueryRunner();
    const pinMigration = new AddConversationPin1789080000000();
    try {
      await pinMigration.down(runner);
      expect(
        (await runner.getTable('api_conversations'))?.findColumnByName('pinned_at'),
      ).toBeUndefined();
      await pinMigration.up(runner);
      expect(
        (await runner.getTable('api_conversations'))?.findColumnByName('pinned_at')?.isNullable,
      ).toBe(true);
      expect((await migration.driver.createSchemaBuilder().log()).upQueries).toEqual([]);
    } finally {
      await runner.release();
    }
  });

  it('renames and pins idempotently while rejecting foreign owners and invalid input', async () => {
    const owner = await user();
    const foreignUsers = [await user(), await user(await tenant())];
    const created = await api('POST', '/conversations', owner.token, {});
    expect(created.status).toBe(201);
    const chat = created.body?.data as { id: string };
    expect(created.body?.data).toMatchObject({ pinnedAt: null, titleSource: 'none' });
    for (const other of foreignUsers) {
      for (const [method, path, body] of [
        ['PATCH', `/conversations/${chat.id}`, { title: 'Attack' }],
        ['POST', `/conversations/${chat.id}/pin`, undefined],
        ['POST', `/conversations/${chat.id}/unpin`, undefined],
      ] as const) {
        const response = await api(method, path, other.token, body);
        expect(response.status).toBe(404);
        expect(response.body?.error?.code).toBe('conversation_not_found');
      }
    }
    expect((await api('POST', `/conversations/${chat.id}/pin`, 'invalid')).status).toBe(401);
    for (const body of [
      {},
      { title: null },
      { title: '' },
      { title: '  ' },
      { title: 'x'.repeat(161) },
      { title: 'Valid', projectId: randomUUID() },
    ]) {
      expect((await api('PATCH', `/conversations/${chat.id}`, owner.token, body)).status).toBe(400);
    }
    const pinned = await api('POST', `/conversations/${chat.id}/pin`, owner.token);
    expect(pinned.status).toBe(200);
    expect(pinned.body?.data?.pinnedAt).toEqual(expect.any(String));
    expect((await api('POST', `/conversations/${chat.id}/pin`, owner.token)).body).toEqual(
      pinned.body,
    );
    const renamed = await api('PATCH', `/conversations/${chat.id}`, owner.token, {
      title: '  Décision  ',
    });
    expect(renamed.body?.data).toMatchObject({
      title: 'Décision',
      titleSource: 'user',
      pinnedAt: pinned.body?.data?.pinnedAt,
    });
    const unpinned = await api('POST', `/conversations/${chat.id}/unpin`, owner.token);
    expect(unpinned.body?.data?.pinnedAt).toBeNull();
    expect((await api('POST', `/conversations/${chat.id}/unpin`, owner.token)).body).toEqual(
      unpinned.body,
    );
  });

  it('paginates more than 100 pins, with exact timestamp boundaries, stable ordering and project filters', async () => {
    const owner = await user();
    const named = (await api('POST', '/projects', owner.token, { name: 'Named' })).body?.data as {
      id: string;
    };
    const standalone = (await api('POST', '/conversations', owner.token, {})).body?.data as {
      id: string;
      projectId: string;
    };
    const rows = Array.from({ length: 113 }, (_, index) => ({
      id: randomUUID(),
      projectId: named.id,
      title: `Chat ${index}`,
      pinnedAt: index < 103 ? new Date() : null,
    }));
    await db.getRepository(ConversationEntity).insert(rows);
    await migration.query(
      `UPDATE "api_conversations" SET "created_at" = '2026-09-10T10:00:00.123456Z'::timestamptz WHERE "project_id" = $1`,
      [named.id],
    );
    // One sub-millisecond difference must survive the raw cursor, rather than rounding to JS Date.
    await migration.query(
      `UPDATE "api_conversations" SET "created_at" = '2026-09-10T10:00:00.123457Z'::timestamptz WHERE "id" = $1`,
      [rows[0]!.id],
    );
    const expected = [
      rows[0]!,
      ...rows.slice(1, 103).sort((a, b) => b.id.localeCompare(a.id)),
      ...rows.slice(103).sort((a, b) => b.id.localeCompare(a.id)),
    ].map(({ id }) => id);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await api(
        'GET',
        `/conversations?projectKind=named${cursor ? `&cursor=${cursor}` : ''}`,
        owner.token,
      );
      expect(page.status).toBe(200);
      const items = page.body?.data?.items ?? [];
      expect(items.length).toBeLessThanOrEqual(10);
      seen.push(...items.map(({ id }) => id as string));
      cursor = page.body?.data?.nextCursor as string | null;
    } while (cursor !== null);
    expect(seen).toEqual(expected);
    expect(
      (await api('GET', '/conversations?projectKind=implicit', owner.token)).body?.data?.items?.map(
        ({ id }) => id,
      ),
    ).toEqual([standalone.id]);
    expect(
      (await api('GET', `/conversations?projectId=${named.id}&projectKind=implicit`, owner.token))
        .body?.data?.items,
    ).toEqual([]);
    expect((await api('GET', '/conversations?projectKind=other', owner.token)).status).toBe(400);
    for (const cursorValue of [
      'bad',
      encodeCursor({ id: randomUUID(), sortValue: '1|2026-02-31T10:00:00.000000Z' }),
    ]) {
      expect((await api('GET', `/conversations?cursor=${cursorValue}`, owner.token)).status).toBe(
        400,
      );
    }
  });

  it('rechecks active state and relation after waiting for the project lock', async () => {
    const owner = await user();
    const chat = (await api('POST', '/conversations', owner.token, {})).body?.data as {
      id: string;
      projectId: string;
    };
    const runner = migration.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query('SELECT id FROM api_projects WHERE id=$1 FOR UPDATE', [chat.projectId]);
      const pending = api('PATCH', `/conversations/${chat.id}`, owner.token, { title: 'Waiting' });
      // Wait for the HTTP transaction to actually block, avoiding timing-based lock tests.
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const waiting: { blocked: boolean }[] = await migration.query(
          `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%api_projects%') AS blocked`,
        );
        if (waiting[0]?.blocked) break;
        if (attempt === 99)
          throw new Error('Expected metadata mutation to wait for the project lock');
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await runner.query(`UPDATE api_projects SET status='archived' WHERE id=$1`, [chat.projectId]);
      await runner.commitTransaction();
      expect((await pending).body?.error?.code).toBe('project_archived');
      expect(
        (await db.getRepository(ConversationEntity).findOneByOrFail({ id: chat.id })).title,
      ).toBe('Nouvelle conversation');
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
