import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApiExceptionFilter } from '@api/common/filters/api-exception.filter';
import { AccessTokenGuard } from '@api/common/guards/access-token.guard';
import { IdempotencyModule } from '@api/common/idempotency/idempotency.module';
import { RequestValidationPipe } from '@api/common/validation/request-validation.pipe';
import { API_MIGRATIONS_TABLE } from '@api/database/database-options';
import { databaseMigrations } from '@api/database/migrations';
import { databaseEntities } from '@api/database/typeorm.options';
import { ContextModule } from '@api/modules/context/context.module';
import { ConversationsModule } from '@api/modules/conversations/conversations.module';
import { ConversationEntity } from '@api/modules/conversations/infrastructure/persistence/conversation.entity';
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
postgres('conversation transfer PostgreSQL HTTP contract', () => {
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
        ContextModule,
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
      for (const id of createdTenants) {
        await removeTenantWorkspaces(db, id);
        await db.getRepository(TenantEntity).delete(id);
      }
    }
    await app?.close();
    if (migration?.isInitialized) await migration.destroy();
  });

  async function setupChat() {
    const owner = await user();
    const chat = (await api('POST', '/conversations', owner.token, { title: 'Keep title' })).body
      ?.data as { id: string; projectId: string };
    const target = (
      await api('POST', '/projects', owner.token, {
        name: 'Target',
        context: '# Canonical project context',
      })
    ).body?.data as { id: string };
    return { owner, chat, target };
  }

  it('moves only the relation, preserves metadata, deletes the empty shell and replays safely', async () => {
    const { owner, chat, target } = await setupChat();
    await api('POST', `/conversations/${chat.id}/pin`, owner.token);
    const before = (await api('GET', `/conversations/${chat.id}`, owner.token)).body?.data;
    const moved = await api(
      'POST',
      `/conversations/${chat.id}/move`,
      owner.token,
      { projectId: target.id.toUpperCase() },
      'move-1',
    );
    expect(moved.status).toBe(200);
    expect(moved.body?.data).toEqual({ ...before, projectId: target.id, projectKind: 'named' });
    expect((await api('GET', `/projects/${chat.projectId}`, owner.token)).status).toBe(404);
    expect((await api('GET', `/projects/${target.id}`, owner.token)).body?.data?.context).toBe(
      '# Canonical project context',
    );
    expect(
      (
        await api(
          'POST',
          `/conversations/${chat.id}/move`,
          owner.token,
          { projectId: target.id.toUpperCase() },
          'move-1',
        )
      ).body,
    ).toEqual(moved.body);
    expect(
      (
        await api('POST', `/conversations/${chat.id}/move`, owner.token, {
          projectId: target.id.toUpperCase(),
        })
      ).body,
    ).toEqual(moved.body);
  });

  it('checks both owners and tenant scopes, DTOs, inactive targets and invalid transitions', async () => {
    const { owner, chat, target } = await setupChat();
    for (const stranger of [await user(), await user(await tenant())]) {
      expect(
        (
          await api('POST', `/conversations/${chat.id}/move`, stranger.token, {
            projectId: target.id,
          })
        ).status,
      ).toBe(404);
      const foreignTarget = (await api('POST', '/projects', stranger.token, { name: 'Foreign' }))
        .body?.data as { id: string };
      const denied = await api('POST', `/conversations/${chat.id}/move`, owner.token, {
        projectId: foreignTarget.id,
      });
      expect(denied.body?.error?.code).toBe('project_not_found');
    }
    for (const body of [
      {},
      { projectId: null },
      { projectId: 'bad' },
      { projectId: target.id, context: 'injected' },
    ])
      expect((await api('POST', `/conversations/${chat.id}/move`, owner.token, body)).status).toBe(
        400,
      );
    const implicit = (await api('POST', '/conversations', owner.token, {})).body?.data as {
      projectId: string;
    };
    expect(
      (
        await api('POST', `/conversations/${chat.id}/move`, owner.token, {
          projectId: implicit.projectId,
        })
      ).body?.error?.code,
    ).toBe('conversation_move_not_allowed');
    for (const status of ['archived', 'deleting']) {
      await migration.query('UPDATE api_projects SET status=$1 WHERE id=$2', [status, target.id]);
      expect(
        (await api('POST', `/conversations/${chat.id}/move`, owner.token, { projectId: target.id }))
          .body?.error?.code,
      ).toBe(`project_${status}`);
    }
    await migration.query("UPDATE api_projects SET status='active' WHERE id=$1", [target.id]);
    expect(
      (await api('POST', `/conversations/${chat.id}/move`, owner.token, { projectId: target.id }))
        .status,
    ).toBe(200);
    const next = (await api('POST', '/projects', owner.token, { name: 'Another' })).body?.data as {
      id: string;
    };
    expect(
      (await api('POST', `/conversations/${chat.id}/move`, owner.token, { projectId: next.id }))
        .body?.error?.code,
    ).toBe('conversation_move_not_allowed');
  });

  it('refuses source content and other chats without losing any of it', async () => {
    for (const changes of [{ description: 'Keep' }, { context: '# Keep' }]) {
      const { owner, chat, target } = await setupChat();
      if (changes.context !== undefined) {
        expect(
          (
            await api('PUT', `/projects/${chat.projectId}/context-documents/context`, owner.token, {
              content: changes.context,
              expectedRevision: 0,
            })
          ).status,
        ).toBe(200);
      } else {
        expect(
          (await api('PATCH', `/projects/${chat.projectId}`, owner.token, changes)).status,
        ).toBe(200);
      }
      expect(
        (await api('POST', `/conversations/${chat.id}/move`, owner.token, { projectId: target.id }))
          .body?.error?.code,
      ).toBe('conversation_source_has_context');
      expect(
        (await api('GET', `/conversations/${chat.id}`, owner.token)).body?.data?.projectId,
      ).toBe(chat.projectId);
    }
    const { owner, chat, target } = await setupChat();
    await db
      .getRepository(ConversationEntity)
      .insert({ projectId: chat.projectId, title: 'Unexpected second chat' });
    expect(
      (await api('POST', `/conversations/${chat.id}/move`, owner.token, { projectId: target.id }))
        .body?.error?.code,
    ).toBe('conversation_source_has_context');
    expect(await db.getRepository(ConversationEntity).countBy({ projectId: chat.projectId })).toBe(
      2,
    );
  });

  it('serializes same and different destination transfers with one surviving conversation', async () => {
    for (const sameTarget of [true, false]) {
      const { owner, chat, target } = await setupChat();
      const other = sameTarget
        ? target
        : ((await api('POST', '/projects', owner.token, { name: 'Other' })).body?.data as {
            id: string;
          });
      const results = await Promise.all(
        [target, other].map(({ id }) =>
          api('POST', `/conversations/${chat.id}/move`, owner.token, { projectId: id }),
        ),
      );
      expect(results.map(({ status }) => status).sort()).toEqual(
        sameTarget ? [200, 200] : [200, 409],
      );
      const saved = await db.getRepository(ConversationEntity).findOneByOrFail({ id: chat.id });
      expect([target.id, other.id]).toContain(saved.projectId);
    }
  });

  it('keeps mutation and deletion races consistent without deadlocks', async () => {
    for (const action of ['rename', 'pin', 'delete-chat', 'delete-source', 'delete-target']) {
      const { owner, chat, target } = await setupChat();
      const concurrent = () => {
        if (action === 'rename')
          return api('PATCH', `/conversations/${chat.id}`, owner.token, {
            title: 'Concurrent title',
          });
        if (action === 'pin') return api('POST', `/conversations/${chat.id}/pin`, owner.token);
        if (action === 'delete-chat')
          return api('DELETE', `/conversations/${chat.id}`, owner.token);
        return api(
          'DELETE',
          `/projects/${action === 'delete-source' ? chat.projectId : target.id}`,
          owner.token,
        );
      };
      const [moved, mutation] = await Promise.all([
        api('POST', `/conversations/${chat.id}/move`, owner.token, { projectId: target.id }),
        concurrent(),
      ]);
      expect([200, 404]).toContain(moved.status);
      expect([200, 204, 404]).toContain(mutation.status);
      const saved = await db.getRepository(ConversationEntity).findOneBy({ id: chat.id });
      if (action === 'rename' && mutation.status === 200 && saved)
        expect(saved.title).toBe('Concurrent title');
      if (action === 'pin' && mutation.status === 200 && saved)
        expect(saved.pinnedAt).not.toBeNull();
      if (moved.status === 200 && saved) expect(saved.projectId).toBe(target.id);
      if (action === 'delete-target' && mutation.status === 204 && saved)
        expect(saved.projectId).toBe(chat.projectId);
    }
  });

  it('revalidates promotion of the implicit source while waiting for its lock', async () => {
    const { owner, chat, target } = await setupChat();
    const runner = migration.createQueryRunner();
    await runner.startTransaction();
    let pending: ReturnType<typeof api> | undefined;
    try {
      await runner.query('SELECT id FROM api_projects WHERE id=$1 FOR UPDATE', [chat.projectId]);
      pending = api('POST', `/conversations/${chat.id}/move`, owner.token, {
        projectId: target.id,
      });
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const waiting: { blocked: boolean }[] = await migration.query(
          `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%api_projects%') AS blocked`,
        );
        if (waiting[0]?.blocked) break;
        if (attempt === 99) throw new Error('Move did not wait for the source lock');
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await runner.query("UPDATE api_projects SET kind='named', name='Promoted' WHERE id=$1", [
        chat.projectId,
      ]);
      await runner.commitTransaction();
      expect((await pending).body?.error?.code).toBe('conversation_move_not_allowed');
      expect(
        (await db.getRepository(ConversationEntity).findOneByOrFail({ id: chat.id })).projectId,
      ).toBe(chat.projectId);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await pending;
      await runner.release();
    }
  });

  it('rolls the relation back if implicit-shell deletion fails', async () => {
    const { owner, chat, target } = await setupChat();
    // Fault injection into the transaction connection leaves HTTP and SQL boundaries real.
    const createRunner = db.createQueryRunner.bind(db);
    const spy = vi.spyOn(db, 'createQueryRunner').mockImplementation((mode) => {
      const runner = createRunner(mode);
      const query = runner.query.bind(runner);
      vi.spyOn(runner, 'query').mockImplementation((...args: Parameters<typeof runner.query>) => {
        if (/DELETE FROM "api_projects"/u.test(args[0]))
          return Promise.reject(new Error('Injected cleanup failure'));
        return query(...args);
      });
      return runner;
    });
    try {
      expect(
        (await api('POST', `/conversations/${chat.id}/move`, owner.token, { projectId: target.id }))
          .status,
      ).toBe(500);
    } finally {
      spy.mockRestore();
    }
    expect((await api('GET', `/conversations/${chat.id}`, owner.token)).body?.data?.projectId).toBe(
      chat.projectId,
    );
    expect((await api('GET', `/projects/${chat.projectId}`, owner.token)).status).toBe(200);
  });
});
