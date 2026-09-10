import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { PROJECT_PIN_LIMIT } from '@alfred/contracts';
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
import { ContextModule } from '@api/modules/context/context.module';
import { ConversationsModule } from '@api/modules/conversations/conversations.module';
import { ConversationEntity } from '@api/modules/conversations/infrastructure/persistence/conversation.entity';
import { ProjectEntity } from '@api/modules/projects/infrastructure/persistence/project.entity';
import { ProjectsModule } from '@api/modules/projects/projects.module';
import { TenantEntity } from '@api/modules/tenants/tenant.entity';
import { UserEntity } from '@api/modules/users/user.entity';
import { UsersModule } from '@api/modules/users/users.module';
import {
  addWorkspaceMembership,
  defaultWorkspace,
  removeTenantWorkspaces,
} from '../../../support/workspace.fixture';

const databaseUrl = process.env.TEST_DATABASE_URL;
const migrationDatabaseUrl = process.env.TEST_MIGRATION_DATABASE_URL;
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
  const createdWorkspaces = new Set<string>();
  const createdTenants = new Set<string>();

  async function tenant(): Promise<string> {
    const id = randomUUID();
    createdTenants.add(id);
    await db
      .getRepository(TenantEntity)
      .insert({ id, name: 'Other tenant', slug: `t-${id.slice(0, 8)}` });
    return id;
  }

  async function user(
    tenantId = defaultTenantId,
    workspaceId?: string,
  ): Promise<{ id: string; token: string }> {
    const id = randomUUID();
    createdUsers.add(id);
    await db.getRepository(UserEntity).insert({
      displayName: 'Fixture',
      email: `${id}@example.test`,
      id,
      tenantId,
    });
    await addWorkspaceMembership(db, tenantId, id, workspaceId);
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
        UsersModule,
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
      for (const id of createdWorkspaces)
        await db.query('DELETE FROM api_workspaces WHERE id = $1', [id]);
      for (const id of createdTenants) {
        await removeTenantWorkspaces(db, id);
        await db.getRepository(TenantEntity).delete(id);
      }
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
    const workspaceRows = await db.query<{ id: string }[]>(
      "INSERT INTO api_workspaces(tenant_id, slug, name) VALUES ($1, $2, 'Other team') RETURNING id",
      [defaultTenantId, randomUUID()],
    );
    createdWorkspaces.add(workspaceRows[0]!.id);
    const colleague = await user(defaultTenantId, workspaceRows[0]!.id);

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

    for (const other of [neighbour, colleague, stranger]) {
      expect((await api('GET', `/projects/${project.id}`, other.token)).status).toBe(404);
      expect(
        (await api('PATCH', `/projects/${project.id}`, other.token, { name: 'x' })).status,
      ).toBe(404);
      expect((await api('DELETE', `/projects/${project.id}`, other.token)).status).toBe(404);
    }

    expect(
      (
        await api('PUT', `/projects/${project.id}/context-documents/context`, owner.token, {
          content: '# Contexte\n\nDétails.',
          expectedRevision: 0,
        })
      ).status,
    ).toBe(200);
    const updated = await api('PATCH', `/projects/${project.id}`, owner.token, {
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

  it('keeps named and standalone conversations private within and across workspaces, including after adding membership', async () => {
    const owner = await user();
    const teammate = await user();
    const rows = await db.query<{ id: string }[]>(
      "INSERT INTO api_workspaces(tenant_id, slug, name) VALUES ($1, $2, 'Second team') RETURNING id",
      [defaultTenantId, randomUUID()],
    );
    const otherWorkspaceId = rows[0]!.id;
    createdWorkspaces.add(otherWorkspaceId);
    const colleague = await user(defaultTenantId, otherWorkspaceId);
    const project = (await api('POST', '/projects', owner.token, { name: 'Private' })).body!
      .data as { id: string };
    const named = (await api('POST', '/conversations', owner.token, { projectId: project.id }))
      .body!.data as { id: string };
    const standalone = (await api('POST', '/conversations', owner.token, {})).body!.data as {
      id: string;
      projectId: string;
    };

    for (const reassigned of [false, true]) {
      if (reassigned) await addWorkspaceMembership(db, defaultTenantId, owner.id, otherWorkspaceId);
      expect((await api('GET', `/projects/${project.id}`, owner.token)).status).toBe(200);
      for (const chat of [named, standalone]) {
        expect((await api('GET', `/conversations/${chat.id}`, owner.token)).status).toBe(200);
        for (const other of [teammate, colleague]) {
          expect((await api('GET', '/conversations', other.token)).body?.data?.items).toEqual([]);
          expect((await api('GET', `/conversations/${chat.id}`, other.token)).status).toBe(404);
          expect(
            (await api('PATCH', `/conversations/${chat.id}`, other.token, { title: 'Intrusion' }))
              .status,
          ).toBe(404);
          expect((await api('DELETE', `/conversations/${chat.id}`, other.token)).status).toBe(404);
          expect((await api('GET', `/projects/${project.id}`, other.token)).status).toBe(404);
        }
      }
    }
    expect(await db.getRepository(ProjectEntity).findOneByOrFail({ id: project.id })).toMatchObject(
      { ownerUserId: owner.id, tenantId: defaultTenantId },
    );
    expect(
      await db.getRepository(ProjectEntity).findOneByOrFail({ id: standalone.projectId }),
    ).toMatchObject({ ownerUserId: owner.id, kind: 'implicit' });
  });

  it('returns only the authenticated membership and lists multiple workspaces without accepting another user selector', async () => {
    const owner = await user();
    const neighbour = await user();
    const stranger = await user(await tenant());
    const membership = await api('GET', '/users/me/workspaces', owner.token);
    const team = await defaultWorkspace(db, defaultTenantId);
    const tenantRecord = await db
      .getRepository(TenantEntity)
      .findOneByOrFail({ id: defaultTenantId });
    expect(membership).toMatchObject({
      status: 200,
      body: {
        success: true,
        data: {
          tenant: { id: defaultTenantId, name: tenantRecord.name },
          workspaces: [{ id: team, name: 'Équipe générale' }],
        },
      },
    });
    expect((await api('GET', '/users/me/workspaces', neighbour.token)).body).toEqual(
      membership.body,
    );
    expect(
      (
        await api(
          'GET',
          `/users/me/workspaces?userId=${stranger.id}&tenantId=foreign&workspaceId=foreign`,
          owner.token,
        )
      ).body,
    ).toEqual(membership.body);
    expect((await fetch(`${url}/users/me/workspaces`)).status).toBe(401);
    expect((await api('GET', '/users/me/workspaces', 'invalid-token')).status).toBe(401);
    expect(
      (await api('POST', '/users/me/workspaces', owner.token, { userId: stranger.id })).status,
    ).toBe(404);
    expect((await api('GET', `/users/${stranger.id}/workspaces`, owner.token)).status).toBe(404);
    const rows = await db.query<{ id: string }[]>(
      "INSERT INTO api_workspaces(tenant_id, slug, name) VALUES ($1, $2, 'Reassigned team') RETURNING id",
      [defaultTenantId, randomUUID()],
    );
    const workspaceId = rows[0]!.id;
    createdWorkspaces.add(workspaceId);
    await addWorkspaceMembership(db, defaultTenantId, owner.id, workspaceId);
    expect((await api('GET', '/users/me/workspaces', owner.token)).body?.data).toEqual({
      tenant: { id: defaultTenantId, name: tenantRecord.name },
      workspaces: expect.arrayContaining([
        { id: team, name: 'Équipe générale' },
        { id: workspaceId, name: 'Reassigned team' },
      ]) as unknown,
    });
    expect(
      (await api('GET', `/users/me/workspaces?userId=${owner.id}`, neighbour.token)).body,
    ).toEqual(membership.body);
    expect((await api('GET', '/users/me/workspaces', stranger.token)).body?.data).not.toEqual(
      membership.body?.data,
    );
    await db.getRepository(UserEntity).update(owner.id, { status: 'disabled' });
    expect((await api('GET', '/users/me/workspaces', owner.token)).status).toBe(401);
  });

  it('keeps workspace reads consistent with private resource access for a suspended tenant', async () => {
    const tenantId = await tenant();
    const owner = await user(tenantId);
    const neighbour = await user(tenantId);
    const project = await api('POST', '/projects', owner.token, { name: 'Private project' });
    expect(project.status).toBe(201);
    const projectId = project.body!.data!.id as string;
    const membership = await api('GET', '/users/me/workspaces', owner.token);
    expect(membership.status).toBe(200);

    await db.getRepository(TenantEntity).update(tenantId, { status: 'suspended' });

    expect(await api('GET', '/users/me/workspaces', owner.token)).toEqual(membership);
    expect((await api('GET', `/projects/${projectId}`, owner.token)).status).toBe(200);
    expect((await api('GET', `/projects/${projectId}`, neighbour.token)).status).toBe(404);
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

  it('pins projects in pin order, keeps them out of the recent list and refuses implicit shells', async () => {
    const owner = await user();
    const ids: string[] = [];
    for (const name of ['Alpha', 'Beta', 'Gamma']) {
      const created = await api('POST', '/projects', owner.token, { name });
      ids.push((created.body?.data as { id: string }).id);
    }
    const [alpha, beta, gamma] = ids as [string, string, string];

    expect((await api('POST', `/projects/${beta}/pin`, owner.token)).body?.data).toMatchObject({
      id: beta,
      pinnedAt: expect.any(String) as string,
    });
    const alphaPinnedTwice = [
      await api('POST', `/projects/${alpha}/pin`, owner.token),
      await api('POST', `/projects/${alpha}/pin`, owner.token),
    ];
    expect(alphaPinnedTwice[0]?.body?.data).toEqual(alphaPinnedTwice[1]?.body?.data);

    const pinned = await api('GET', '/projects?pinned=true', owner.token);
    expect(pinned.body?.data?.items?.map(({ id }) => id)).toEqual([beta, alpha]);
    const recent = await api('GET', '/projects?pinned=false&limit=3', owner.token);
    expect(recent.body?.data?.items?.map(({ id }) => id)).toEqual([gamma]);
    expect((await api('GET', '/projects', owner.token)).body?.data?.items).toHaveLength(3);

    expect((await api('POST', `/projects/${beta}/unpin`, owner.token)).body?.data).toMatchObject({
      pinnedAt: null,
    });
    expect(
      (await api('GET', '/projects?pinned=true', owner.token)).body?.data?.items?.map(
        ({ id }) => id,
      ),
    ).toEqual([alpha]);

    const standalone = (await api('POST', '/conversations', owner.token, {})).body?.data as {
      projectId: string;
    };
    expect(
      (await api('POST', `/projects/${standalone.projectId}/pin`, owner.token)).body,
    ).toMatchObject({ error: { code: 'project_implicit' } });
    const other = await user();
    expect((await api('POST', `/projects/${alpha}/pin`, other.token)).status).toBe(404);
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

  it('refuses the pin that would exceed the announced limit', async () => {
    const owner = await user();
    const ids: string[] = [];
    for (let index = 0; index <= PROJECT_PIN_LIMIT; index += 1) {
      const created = await api('POST', '/projects', owner.token, { name: `Projet ${index}` });
      ids.push((created.body?.data as { id: string }).id);
    }
    const [overflow, ...pinnable] = ids as [string, ...string[]];
    for (const id of pinnable) {
      expect((await api('POST', `/projects/${id}/pin`, owner.token)).status).toBe(200);
    }

    const refused = await api('POST', `/projects/${overflow}/pin`, owner.token);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ error: { code: 'project_pin_limit_reached' } });
    expect((await api('GET', '/projects?pinned=true', owner.token)).body?.data?.items).toHaveLength(
      PROJECT_PIN_LIMIT,
    );
    expect(
      (await api('GET', '/projects?pinned=false', owner.token)).body?.data?.items?.map(
        ({ id }) => id,
      ),
    ).toEqual([overflow]);

    expect((await api('POST', `/projects/${pinnable[0]}/unpin`, owner.token)).status).toBe(200);
    expect((await api('POST', `/projects/${overflow}/pin`, owner.token)).status).toBe(200);
  });

  it('deletes a chat and its project concurrently without deadlocking', async () => {
    const owner = await user();
    for (let round = 0; round < 6; round += 1) {
      const project = (await api('POST', '/projects', owner.token, { name: `Course ${round}` }))
        .body?.data as { id: string };
      const chat = (
        await api('POST', '/conversations', owner.token, { projectId: project.id, title: 'Chat' })
      ).body?.data as { id: string };

      const [chatDeletion, projectDeletion] = await Promise.all([
        api('DELETE', `/conversations/${chat.id}`, owner.token),
        api('DELETE', `/projects/${project.id}`, owner.token),
      ]);

      expect([204, 404]).toContain(chatDeletion.status);
      expect(projectDeletion.status).toBe(204);
      expect(await db.getRepository(ConversationEntity).countBy({ id: chat.id })).toBe(0);
    }
  });

  it('validates inputs at the HTTP boundary and hides identifier formats', async () => {
    const owner = await user();

    expect((await api('POST', '/projects', owner.token, { name: '   ' })).status).toBe(400);
    expect((await api('POST', '/projects', owner.token, { extra: 1, name: 'x' })).status).toBe(400);
    const project = (await api('POST', '/projects', owner.token, { name: 'Nulls' })).body?.data as {
      id: string;
    };
    for (const body of [{ name: null }, { description: null }, { context: null }]) {
      const rejected = await api('PATCH', `/projects/${project.id}`, owner.token, body);
      expect(rejected.status).toBe(400);
    }
    expect(
      (await api('POST', '/projects', owner.token, { description: null, name: 'x' })).status,
    ).toBe(400);
    expect(
      (await api('POST', '/conversations', owner.token, { projectId: null, title: null })).status,
    ).toBe(400);
    expect((await api('GET', `/projects/${project.id}`, owner.token)).body?.data).toMatchObject({
      description: null,
      name: 'Nulls',
    });
    expect((await api('GET', '/projects/not-a-uuid', owner.token)).body).toMatchObject({
      error: { code: 'project_not_found' },
    });
    expect((await api('GET', '/conversations/not-a-uuid', owner.token)).body).toMatchObject({
      error: { code: 'conversation_not_found' },
    });
    expect((await api('GET', '/projects', 'not-a-token')).status).toBe(401);
  });
});
