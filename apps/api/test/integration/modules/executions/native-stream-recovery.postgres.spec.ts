import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXECUTION_JSON_PROFILE, executionSnapshotEnvelopeSchema } from '@alfred/contracts';
import { ApiExceptionFilter } from '@api/common/filters/api-exception.filter';
import { AccessTokenGuard } from '@api/common/guards/access-token.guard';
import { RequestValidationPipe } from '@api/common/validation/request-validation.pipe';
import { databaseMigrations } from '@api/database/migrations';
import { API_MIGRATIONS_TABLE } from '@api/database/database-options';
import { databaseEntities } from '@api/database/typeorm.options';
import { ExecutionRecoveryWorker } from '@api/modules/executions/application/execution-recovery.worker';
import { ExecutionProcessor } from '@api/modules/executions/application/execution-processor';
import { ExecutionStreamConsumer } from '@api/modules/executions/application/execution-stream.consumer';
import { ExecutionsService } from '@api/modules/executions/application/executions.service';
import { LangGraphRuntimeClient } from '@api/modules/executions/infrastructure/langgraph/langgraph-runtime.client';
import {
  AgUiReplicaBuilder,
  parseAgUiFrame,
  type ObservedReplica,
} from '../../../support/ag-ui-frames';
import { ExecutionLeaseStore } from '@api/modules/executions/infrastructure/persistence/execution-lease.store';
import { ExecutionStateStore } from '@api/modules/executions/infrastructure/persistence/execution-state.store';
import { ExecutionEntity } from '@api/modules/executions/infrastructure/persistence/execution.entity';
import { MessageEntity } from '@api/modules/executions/infrastructure/persistence/message.entity';
import { ExecutionsModule } from '@api/modules/executions/executions.module';
import { StreamModule } from '@api/modules/stream/stream.module';
import { FeatureFlagGuard } from '@api/modules/feature-flags/feature-flag.guard';
import { FeatureFlagsService } from '@api/modules/feature-flags/feature-flags.service';
import { ConversationEntity } from '@api/modules/conversations/infrastructure/persistence/conversation.entity';
import { ProjectEntity } from '@api/modules/projects/infrastructure/persistence/project.entity';
import { TenantEntity } from '@api/modules/tenants/tenant.entity';
import { UserEntity } from '@api/modules/users/user.entity';
import { RefreshSessionEntity } from '@api/modules/auth/infrastructure/persistence/entities/refresh-session.entity';
import { NativeStreamFixture } from './native-stream.fixture';

const databaseUrl = process.env.TEST_DATABASE_URL;
const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL;
const soakRequested = process.env.ALFRED_SSE_SOAK_MS !== undefined;
const durationMs = Number(process.env.ALFRED_SSE_SOAK_MS ?? 0);
if (
  soakRequested &&
  (!Number.isInteger(durationMs) || durationMs < 1_000 || durationMs > 300_000)
) {
  throw new Error('ALFRED_SSE_SOAK_MS must be an integer between 1000 and 300000');
}
if (soakRequested && (!databaseUrl || !migrationUrl)) {
  throw new Error(
    'The requested SSE soak requires TEST_DATABASE_URL and TEST_MIGRATION_DATABASE_URL',
  );
}
// Explicit opt-in: the ordinary PostgreSQL gate must never silently become a four-minute soak.
const soak = databaseUrl && migrationUrl && durationMs >= 1_000 ? describe : describe.skip;
soak('native HTTP streaming recovery over wall-clock time', () => {
  let db: DataSource;
  let migration: DataSource;
  let app: INestApplication;
  let url: string;
  let userId: string;
  let token: string;
  let conversationId: string;
  const native = new NativeStreamFixture(durationMs);
  const processors: ExecutionProcessor[] = [];
  const readers: SnapshotReader[] = [];
  const pending: Promise<void>[] = [];

  beforeAll(async () => {
    await native.start();
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
              EXECUTION_CURSOR_KEY: 'synthetic-soak-cursor-secret-12345678901234567890',
              AGENT_RUNTIME_URL: native.url,
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
          secret: 'synthetic-soak-jwt-secret-12345678901234567890',
          signOptions: { expiresIn: 600 },
        }),
        ExecutionsModule,
        StreamModule,
      ],
      providers: [
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_GUARD, useClass: FeatureFlagGuard },
        { provide: FeatureFlagsService, useValue: { isEnabled: () => true } },
        { provide: APP_GUARD, useClass: AccessTokenGuard },
      ],
    })
      .overrideProvider(ExecutionRecoveryWorker)
      .useValue({})
      .compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(new RequestValidationPipe());
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer() as { address(): AddressInfo }).address().port}`;
    db = app.get(DataSource);
    const tenantId = (await db.getRepository(TenantEntity).findOneByOrFail({ slug: 'default' })).id;
    userId = randomUUID();
    const sid = randomUUID();
    await db.getRepository(UserEntity).insert({
      id: userId,
      tenantId,
      email: `${userId}@example.test`,
      displayName: 'Soak fixture',
    });
    await db.getRepository(RefreshSessionEntity).insert({
      id: sid,
      userId,
      familyId: randomUUID(),
      tokenHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
      expiresAt: new Date(Date.now() + 600_000),
    });
    const project = await db.getRepository(ProjectEntity).save({
      tenantId,
      ownerUserId: userId,
      kind: 'named',
      name: 'Soak fixture',
    });
    const conversation = await db.getRepository(ConversationEntity).save({
      projectId: project.id,
      title: 'Soak fixture',
      titleSource: 'user',
    });
    conversationId = conversation.id;
    token = app.get(JwtService).sign({
      email: `${userId}@example.test`,
      role: 'user',
      sid,
      sub: userId,
      typ: 'access',
    });
  }, 30_000);

  afterAll(async () => {
    for (const reader of readers) reader.abort();
    for (const processor of processors) processor.shutdown();
    await native.close();
    await Promise.allSettled(pending);
    await Promise.allSettled(readers.map((reader) => reader.done));
    if (db?.isInitialized && userId) await db.getRepository(UserEntity).delete(userId);
    await app?.close();
    if (migration?.isInitialized) await migration.destroy();
  }, 30_000);

  function request(path: string, body?: unknown) {
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

  function processor() {
    const config = app.get(ConfigService);
    const states = app.get(ExecutionStateStore);
    const runtime = new LangGraphRuntimeClient(config, app.get(ExecutionsService));
    const result = new ExecutionProcessor(
      states,
      app.get(ExecutionLeaseStore),
      runtime,
      config,
      new ExecutionStreamConsumer(states, runtime, config),
    );
    processors.push(result);
    return result;
  }

  async function observe(executionId: string, cursor?: string) {
    const reader = new SnapshotReader();
    readers.push(reader);
    await reader.start(`${url}/executions/${executionId}/events`, token, cursor);
    return reader;
  }

  it(
    'recovers a lost native acknowledgement, browser detach and processor replacement without duplicate work',
    async () => {
      const created = await request(`/conversations/${conversationId}/executions`, {
        message: 'Run the deterministic streaming fixture.',
        submissionId: randomUUID(),
      });
      expect(created.status).toBe(200);
      const executionId = executionSnapshotEnvelopeSchema.parse(await created.json()).data.snapshot
        .execution.id;
      const leases = app.get(ExecutionLeaseStore);
      const row = () => db.getRepository(ExecutionEntity).findOneByOrFail({ id: executionId });
      const firstClaim = (await leases.claim('soak-lost-ack', 30_000))!;
      await processor().process(firstClaim);
      await leases.release(firstClaim, 0);
      expect(await row()).toMatchObject({ status: 'recovering', sourceWatermark: null });
      expect(native.creates).toBe(1);

      const live = processor();
      const liveClaim = (await leases.claim('soak-live', 30_000))!;
      const liveWork = live.process(liveClaim);
      pending.push(liveWork);
      await until(async () => (await row()).publicText === 'A durable');
      expect(native.requests.some((r) => r.method === 'GET' && r.path.endsWith('/runs'))).toBe(
        true,
      );
      const firstReader = await observe(executionId);
      await until(() => firstReader.snapshots.some((s) => s.assistantText === 'A durable'));
      await atFraction(native, 0.25);
      const cursor = firstReader.snapshots.at(-1)?.cursor;
      expect(cursor).toBeTruthy();
      firstReader.abort();
      await firstReader.done;
      expect(native.cancelled).toBe(0);

      // Reattach after the original event has expired from the native replay window.
      await atFraction(native, 0.7);
      const secondReader = await observe(executionId, cursor!);
      await until(() =>
        secondReader.snapshots.some((s) => s.assistantText === 'A durable streaming'),
      );
      await atFraction(native, 0.75);
      expect(await row()).toMatchObject({ publicText: 'A durable streaming', status: 'running' });
      const watermarkBeforeRestart = (await row()).sourceWatermark;
      const replacementAtMs = Date.now() - native.startedAt;
      live.shutdown();
      await liveWork;
      await leases.release(liveClaim, 0);
      const replacementClaim = (await leases.claim('soak-replacement', 30_000))!;
      expect(replacementClaim.leaseVersion).toBeGreaterThan(liveClaim.leaseVersion);
      const replacementWork = processor().process(replacementClaim);
      pending.push(replacementWork);
      await replacementWork;
      await leases.release(replacementClaim, 0);
      await until(async () => (await row()).status === 'completed');
      await until(() =>
        secondReader.snapshots.some((s) => s.assistantText === 'A durable streaming answer.'),
      );
      secondReader.abort();
      await secondReader.done;

      const finalReader = await observe(executionId, secondReader.snapshots.at(-1)!.cursor!);
      await finalReader.done;
      expect(finalReader.snapshots.at(-1)).toMatchObject({
        assistantText: 'A durable streaming answer.',
        execution: { id: executionId, status: 'completed' },
      });
      expect(await row()).toMatchObject({
        runtimeRunId: native.runId,
        sourceWatermark: native.frames.at(-1)!.id,
        projectionRevision: 3,
        publicText: 'A durable streaming answer.',
        status: 'completed',
      });
      expect(
        (await db.getRepository(MessageEntity).findBy({ executionId, role: 'assistant' })).map(
          (m) => m.content,
        ),
      ).toEqual(['A durable streaming answer.']);
      expect(native.creates).toBe(1);
      expect(native.cancelled).toBe(0);
      expect(native.joins).toHaveLength(2);
      expect(
        native.joins.some(
          (join) => join.atMs >= replacementAtMs && join.after === watermarkBeforeRestart,
        ),
      ).toBe(true);
      expect(
        native.requests.some((r) => r.method === 'GET' && r.path.endsWith(`/runs/${native.runId}`)),
      ).toBe(true);
      for (const reader of readers) {
        expect(reader.errors).toEqual([]);
        expect(
          reader.snapshots.every((s) => 'A durable streaming answer.'.startsWith(s.assistantText)),
        ).toBe(true);
        // One attach per reader: every replica belongs to the single synthesized AG-UI run.
        expect(reader.snapshots.every((s) => s.runs === 1)).toBe(true);
      }
      const elapsedMs = Date.now() - native.startedAt;
      expect(elapsedMs).toBeGreaterThanOrEqual(durationMs);
      const maxByteGapMs = Math.max(...readers.map((reader) => reader.maxByteGapMs));
      expect(maxByteGapMs).toBeLessThan(35_000);
      process.stdout.write(
        'ALFRED_SSE_SOAK_RESULT ' +
          JSON.stringify({
            requestedMs: durationMs,
            elapsedMs,
            replacementAtMs,
            maxByteGapMs,
            nativeCreates: native.creates,
            nativeJoins: native.joins,
            finalRevision: 3,
            boundary:
              'Real Alfred Nest services, native HTTP adapter, PostgreSQL and SSE readers; deterministic native protocol fixture.',
          }) +
          '\n',
      );
    },
    durationMs + 60_000,
  );
});

async function until(check: () => boolean | Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for soak condition');
    await delay(20);
  }
}

async function atFraction(native: NativeStreamFixture, fraction: number): Promise<void> {
  await delay(Math.max(0, native.startedAt + native.durationMs * fraction - Date.now()));
}

/** A real fetch reader: validates every AG-UI frame and reconstructs the browser's view. */
class SnapshotReader {
  readonly snapshots: ObservedReplica[] = [];
  readonly errors: unknown[] = [];
  private readonly replica = new AgUiReplicaBuilder();
  maxByteGapMs = 0;
  done: Promise<void> = Promise.resolve();
  private readonly controller = new AbortController();

  async start(url: string, token: string, cursor?: string): Promise<void> {
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'text/event-stream',
        ...(cursor === undefined ? {} : { 'last-event-id': cursor }),
      },
      signal: this.controller.signal,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    this.done = this.read(response).catch((error: unknown) => {
      if (!this.controller.signal.aborted) this.errors.push(error);
    });
  }

  abort(): void {
    this.controller.abort();
  }

  private async read(response: Response): Promise<void> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let lastByteAt = Date.now();
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) return;
        const now = Date.now();
        this.maxByteGapMs = Math.max(this.maxByteGapMs, now - lastByteAt);
        lastByteAt = now;
        text += decoder.decode(chunk.value, { stream: true });
        let boundary: number;
        while ((boundary = text.indexOf('\n\n')) !== -1) {
          const frame = parseAgUiFrame(text.slice(0, boundary));
          text = text.slice(boundary + 2);
          if (frame?.kind === 'error') this.errors.push(frame.data);
          else if (frame?.kind === 'agui') this.snapshots.push(this.replica.push(frame)!);
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}
