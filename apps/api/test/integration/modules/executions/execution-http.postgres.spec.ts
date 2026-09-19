import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EXECUTION_JSON_PROFILE, executionSnapshotEnvelopeSchema } from '@alfred/contracts';
import { ApiExceptionFilter } from '@api/common/filters/api-exception.filter';
import { AccessTokenGuard } from '@api/common/guards/access-token.guard';
import { RequestValidationPipe } from '@api/common/validation/request-validation.pipe';
import { databaseMigrations } from '@api/database/migrations';
import { API_MIGRATIONS_TABLE } from '@api/database/database-options';
import { databaseEntities } from '@api/database/typeorm.options';
import { ExecutionRecoveryWorker } from '@api/modules/executions/application/execution-recovery.worker';
import { ExecutionProcessor } from '@api/modules/executions/application/execution-processor';
import { RUNTIME_CLIENT } from '@api/modules/executions/application/runtime-client.port';
import { ExecutionLeaseStore } from '@api/modules/executions/infrastructure/persistence/execution-lease.store';
import { ExecutionEntity } from '@api/modules/executions/infrastructure/persistence/execution.entity';
import { ExecutionsModule } from '@api/modules/executions/executions.module';
import { StreamModule } from '@api/modules/stream/stream.module';
import { FeatureFlagGuard } from '@api/modules/feature-flags/feature-flag.guard';
import { FeatureFlagsService } from '@api/modules/feature-flags/feature-flags.service';
import { ConversationEntity } from '@api/modules/conversations/infrastructure/persistence/conversation.entity';
import { ProjectEntity } from '@api/modules/projects/infrastructure/persistence/project.entity';
import { TenantEntity } from '@api/modules/tenants/tenant.entity';
import { UserEntity } from '@api/modules/users/user.entity';
import { RefreshSessionEntity } from '@api/modules/auth/infrastructure/persistence/entities/refresh-session.entity';

const databaseUrl = process.env.TEST_DATABASE_URL;
const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL;
const postgres = databaseUrl && migrationUrl ? describe : describe.skip;
postgres('durable execution authenticated HTTP contract', () => {
  let db: DataSource;
  let migration: DataSource;
  let app: INestApplication;
  let url: string;
  let tenantId: string;
  let enabled = true;
  const users: string[] = [];
  const runtime = {
    dispatch: vi.fn(async (executionId: string, invocationId: string) =>
      run(executionId, invocationId),
    ),
    inspect: vi.fn(async (executionId: string, invocationId: string) =>
      run(executionId, invocationId),
    ),
    cancel: vi.fn(async (executionId: string, invocationId: string) =>
      run(executionId, invocationId),
    ),
    generateTitle: vi.fn().mockResolvedValue(null),
    join: vi.fn(async function* () {
      await Promise.resolve();
      yield {
        id: '1',
        event: 'messages-tuple',
        data: [{ id: 'answer', type: 'AIMessageChunk', content: 'Safe answer' }, {}],
      };
    }),
  };
  async function run(executionId: string, invocationId: string) {
    const row = await db.getRepository(ExecutionEntity).findOneByOrFail({ id: executionId });
    return {
      executionId,
      invocationId,
      threadId: row.runtimeThreadId!,
      runId: row.invocationId,
      status: 'success',
      stopRequested: false,
      replayAvailable: true,
    };
  }
  beforeAll(async () => {
    migration = new DataSource({
      type: 'postgres',
      url: migrationUrl!,
      entities: [...databaseEntities],
      migrations: [...databaseMigrations],
      migrationsTableName: API_MIGRATIONS_TABLE,
      synchronize: false,
    });
    await migration.initialize();
    await migration.runMigrations({ transaction: 'each' });
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              FEATURE_AGENT_RUNTIME_ENABLED: true,
              EXECUTION_CURSOR_KEY: 'cursor-fixture-secret-12345678901234567890',
              AGENT_RUNTIME_ASSISTANT_ID: 'fixture',
              AGENT_RUNTIME_TITLE_ASSISTANT_ID: '',
            }),
          ],
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: databaseUrl!,
          entities: [...databaseEntities],
          synchronize: false,
          retryAttempts: 0,
        }),
        JwtModule.register({
          global: true,
          secret: 'synthetic-http-stream-jwt-secret-123456789',
          signOptions: { expiresIn: 300 },
        }),
        ExecutionsModule,
        StreamModule,
      ],
      providers: [
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_GUARD, useClass: FeatureFlagGuard },
        { provide: FeatureFlagsService, useValue: { isEnabled: () => enabled } },
        { provide: APP_GUARD, useClass: AccessTokenGuard },
      ],
    })
      .overrideProvider(RUNTIME_CLIENT)
      .useValue(runtime)
      .overrideProvider(ExecutionRecoveryWorker)
      .useValue({})
      .compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(new RequestValidationPipe());
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer() as { address(): AddressInfo }).address().port}`;
    db = app.get(DataSource);
    tenantId = (await db.getRepository(TenantEntity).findOneByOrFail({ slug: 'default' })).id;
  });
  afterAll(async () => {
    if (db?.isInitialized) for (const id of users) await db.getRepository(UserEntity).delete(id);
    await app?.close();
    if (migration?.isInitialized) await migration.destroy();
  });
  async function fixture() {
    const id = randomUUID();
    users.push(id);
    const sid = randomUUID();
    await db
      .getRepository(UserEntity)
      .insert({ id, tenantId, email: `${id}@example.test`, displayName: 'Fixture' });
    await db.getRepository(RefreshSessionEntity).insert({
      id: sid,
      userId: id,
      familyId: randomUUID(),
      tokenHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
      expiresAt: new Date(Date.now() + 600000),
    });
    const project = await db
      .getRepository(ProjectEntity)
      .save({ tenantId, ownerUserId: id, kind: 'named', name: 'Fixture' });
    const chat = await db
      .getRepository(ConversationEntity)
      .save({ projectId: project.id, title: 'Fixture', titleSource: 'user' });
    const token = app
      .get(JwtService)
      .sign({ email: `${id}@example.test`, role: 'user', sid, sub: id, typ: 'access' });
    return { id, sid, chat, token };
  }
  function request(path: string, token: string, body?: unknown) {
    return fetch(url + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: EXECUTION_JSON_PROFILE,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  it('negotiates creation, idempotent retry, authorized discovery, worker persistence and terminal SSE', async () => {
    const f = await fixture();
    const body = { message: 'Hello', submissionId: randomUUID() };
    const first = await request(`/conversations/${f.chat.id}/executions`, f.token, body);
    expect(first.status).toBe(200);
    const created = executionSnapshotEnvelopeSchema.parse(await first.json()).data.snapshot;
    const again = await request(`/conversations/${f.chat.id}/executions`, f.token, body);
    expect(
      executionSnapshotEnvelopeSchema.parse(await again.json()).data.snapshot.execution.id,
    ).toBe(created.execution.id);
    const active = await request(`/conversations/${f.chat.id}/executions/active`, f.token);
    expect(
      executionSnapshotEnvelopeSchema.parse(await active.json()).data.snapshot.execution.id,
    ).toBe(created.execution.id);
    const leases = app.get(ExecutionLeaseStore);
    const claimed = (await leases.claim('http-fixture', 30000))!;
    await app.get(ExecutionProcessor).process(claimed);
    await leases.release(claimed, 0);
    const result = await request(`/executions/${created.execution.id}`, f.token);
    expect(executionSnapshotEnvelopeSchema.parse(await result.json()).data.snapshot).toMatchObject({
      assistantText: 'Safe answer',
      execution: { status: 'completed' },
    });
    const observer = await request(`/executions/${created.execution.id}/events`, f.token);
    expect(observer.headers.get('content-type')).toContain('text/event-stream');
    const text = await observer.text();
    expect(text).toContain('event: snapshot');
    expect(text).toContain('Safe answer');
    expect(text).not.toContain(claimed.invocationId);
  });
  it('denies foreign/revoked observation and Stop', async () => {
    const owner = await fixture();
    const foreign = await fixture();
    const response = await request(`/conversations/${owner.chat.id}/executions`, owner.token, {
      message: 'Hello',
      submissionId: randomUUID(),
    });
    const id = executionSnapshotEnvelopeSchema.parse(await response.json()).data.snapshot.execution
      .id;
    expect((await request(`/executions/${id}`, foreign.token)).status).toBe(404);
    expect((await request(`/executions/${id}/stop`, foreign.token, {})).status).toBe(404);
    await db.getRepository(RefreshSessionEntity).update(owner.sid, { revokedAt: new Date() });
    expect((await request(`/executions/${id}/events`, owner.token)).status).toBe(401);
    expect((await request(`/executions/${id}/stop`, owner.token, {})).status).toBe(401);
  });
  it('keeps execution routes unavailable when the capability is disabled', async () => {
    const f = await fixture();
    enabled = false;
    try {
      expect(
        (
          await request(`/conversations/${f.chat.id}/executions`, f.token, {
            message: 'Hello',
            submissionId: randomUUID(),
          })
        ).status,
      ).toBe(404);
      expect((await request(`/executions/${randomUUID()}/events`, f.token)).status).toBe(404);
    } finally {
      enabled = true;
    }
  });
});
