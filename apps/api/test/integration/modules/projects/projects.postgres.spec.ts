import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
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
import { ProjectEntity } from '@api/modules/projects/infrastructure/persistence/project.entity';
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
postgres('projects and conversations PostgreSQL contract', () => {
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

  it('migrates the tenant, project and conversation schema exactly as the entities describe it', async () => {
    const runner = migration.createQueryRunner();
    const users = await runner.getTable('api_users');
    const projects = await runner.getTable('api_projects');
    const conversations = await runner.getTable('api_conversations');
    await runner.release();

    expect(users?.uniques.map(({ name }) => name)).toContain('uq_users_tenant_id');
    expect(projects?.foreignKeys.map(({ name }) => name).sort()).toEqual([
      'fk_projects_owner',
      'fk_projects_tenant',
    ]);
    expect(projects?.foreignKeys.find(({ name }) => name === 'fk_projects_owner')).toMatchObject({
      columnNames: ['tenant_id', 'owner_user_id'],
      onDelete: 'CASCADE',
      referencedColumnNames: ['tenant_id', 'id'],
      referencedTableName: 'api_users',
    });
    expect(projects?.indices.map(({ name }) => name)).toContain('idx_projects_owner_list');
    expect(conversations?.foreignKeys[0]).toMatchObject({
      name: 'fk_conversations_project',
      onDelete: 'CASCADE',
      referencedTableName: 'api_projects',
    });
    const drift = await migration.driver.createSchemaBuilder().log();
    expect(drift.upQueries.map(({ query }) => query)).toEqual([]);
  });

  it('rejects a project whose owner belongs to another tenant at the database level', async () => {
    const foreignTenant = await tenant();
    const owner = await user(foreignTenant);

    await expect(
      db.getRepository(ProjectEntity).insert({
        kind: 'named',
        name: 'Cross-tenant',
        ownerUserId: owner.id,
        tenantId: defaultTenantId,
      }),
    ).rejects.toMatchObject({ driverError: { code: '23503' } });
  });

  it('serves the project lifecycle to its owner and the same 404 to everyone else', async () => {
    const owner = await user();
    const neighbour = await user();
    const stranger = await user(await tenant());

    const created = await api(
      'POST',
      '/projects',
      owner.token,
      { description: 'Une description', name: 'Refonte du portail' },
      'create-1',
    );
    expect(created.status).toBe(201);
    const project = created.body?.data as { id: string };
    expect(created.body?.data).toMatchObject({ kind: 'named', status: 'active' });
    expect(created.body?.data).not.toHaveProperty('tenantId');
    const replay = await api(
      'POST',
      '/projects',
      owner.token,
      { description: 'Une description', name: 'Refonte du portail' },
      'create-1',
    );
    expect(replay.body?.data).toEqual(created.body?.data);

    const list = await api('GET', '/projects', owner.token);
    expect(list.body?.data?.items?.map(({ id }) => id)).toEqual([project.id]);
    expect((await api('GET', '/projects', neighbour.token)).body?.data?.items).toEqual([]);

    for (const other of [neighbour, stranger]) {
      expect((await api('GET', `/projects/${project.id}`, other.token)).status).toBe(404);
      expect(
        (await api('PATCH', `/projects/${project.id}`, other.token, { name: 'x' })).status,
      ).toBe(404);
      expect((await api('DELETE', `/projects/${project.id}`, other.token)).status).toBe(404);
    }

    const updated = await api('PATCH', `/projects/${project.id}`, owner.token, {
      context: '# Contexte\n\nDétails.',
      name: 'Portail v2',
    });
    expect(updated.status).toBe(200);
    expect(updated.body?.data).toMatchObject({
      context: '# Contexte\n\nDétails.',
      description: 'Une description',
      name: 'Portail v2',
    });
    expect((await api('PATCH', `/projects/${project.id}`, owner.token, {})).body).toMatchObject({
      error: { code: 'invalid_update' },
    });

    expect((await api('DELETE', `/projects/${project.id}`, owner.token)).status).toBe(204);
    expect((await api('GET', `/projects/${project.id}`, owner.token)).status).toBe(404);
  });

  it('paginates projects by most recent update with an opaque cursor', async () => {
    const owner = await user();
    for (const name of ['Un', 'Deux', 'Trois']) {
      expect((await api('POST', '/projects', owner.token, { name })).status).toBe(201);
    }

    const first = await api('GET', '/projects?limit=2', owner.token);
    expect(first.body?.data?.items?.map(({ name }) => name)).toEqual(['Trois', 'Deux']);
    const cursor = first.body?.data?.nextCursor as string;
    const second = await api('GET', `/projects?limit=2&cursor=${cursor}`, owner.token);
    expect(second.body?.data?.items?.map(({ name }) => name)).toEqual(['Un']);
    expect(second.body?.data?.nextCursor).toBeNull();
  });

  it('attaches chats to named projects, hides implicit shells and cascades deletions', async () => {
    const owner = await user();
    const project = (await api('POST', '/projects', owner.token, { name: 'Atlas' })).body?.data as {
      id: string;
    };

    const inProject = await api('POST', '/conversations', owner.token, {
      projectId: project.id,
      title: 'Décisions de lancement',
    });
    expect(inProject.status).toBe(201);
    expect(inProject.body?.data).toMatchObject({ projectId: project.id, projectKind: 'named' });

    const standalone = await api('POST', '/conversations', owner.token, {});
    expect(standalone.status).toBe(201);
    const chat = standalone.body?.data as { id: string; projectId: string };
    expect(standalone.body?.data).toMatchObject({
      projectKind: 'implicit',
      title: 'Nouvelle conversation',
      titleSource: 'none',
    });
    expect(
      (await api('GET', '/projects', owner.token)).body?.data?.items?.map(({ id }) => id),
    ).toEqual([project.id]);
    expect(
      (await api('POST', '/conversations', owner.token, { projectId: chat.projectId })).body,
    ).toMatchObject({ error: { code: 'project_implicit' } });

    const projectChats = await api('GET', `/conversations?projectId=${project.id}`, owner.token);
    expect(projectChats.body?.data?.items?.map(({ title }) => title)).toEqual([
      'Décisions de lancement',
    ]);
    const recent = await api('GET', '/conversations', owner.token);
    expect(recent.body?.data?.items?.map(({ projectKind }) => projectKind)).toEqual([
      'implicit',
      'named',
    ]);
    const other = await user();
    expect((await api('GET', `/conversations?projectId=${project.id}`, other.token)).status).toBe(
      404,
    );
    expect((await api('GET', `/conversations/${chat.id}`, other.token)).status).toBe(404);

    expect((await api('DELETE', `/projects/${project.id}`, owner.token)).status).toBe(204);
    expect(await db.getRepository(ConversationEntity).countBy({ projectId: project.id })).toBe(0);
    expect((await api('DELETE', `/conversations/${chat.id}`, owner.token)).status).toBe(204);
    expect(await db.getRepository(ProjectEntity).countBy({ id: chat.projectId })).toBe(0);
  });

  it('validates inputs at the HTTP boundary and hides identifier formats', async () => {
    const owner = await user();

    expect((await api('POST', '/projects', owner.token, { name: '   ' })).status).toBe(400);
    expect((await api('POST', '/projects', owner.token, { extra: 1, name: 'x' })).status).toBe(400);
    expect((await api('GET', '/projects/not-a-uuid', owner.token)).body).toMatchObject({
      error: { code: 'project_not_found' },
    });
    expect((await api('GET', '/conversations/not-a-uuid', owner.token)).body).toMatchObject({
      error: { code: 'conversation_not_found' },
    });
    expect((await api('GET', '/projects', 'not-a-token')).status).toBe(401);
  });
});
