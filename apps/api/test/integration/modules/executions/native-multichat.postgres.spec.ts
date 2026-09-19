import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

import { NativeMultichatFixture, MultichatSnapshotReader } from './native-multichat.fixture';

const databaseUrl = process.env.TEST_DATABASE_URL;
const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL;
const soakRequested = process.env.ALFRED_MULTICHAT_SOAK_MS !== undefined;
const durationMs = Number(process.env.ALFRED_MULTICHAT_SOAK_MS ?? 0);
if (
  soakRequested &&
  (!Number.isInteger(durationMs) || durationMs < 10_000 || durationMs > 300_000)
) {
  throw new Error('ALFRED_MULTICHAT_SOAK_MS must be an integer between 10000 and 300000');
}
if (soakRequested && (!databaseUrl || !migrationUrl)) {
  throw new Error(
    'The requested multichat soak requires TEST_DATABASE_URL and TEST_MIGRATION_DATABASE_URL',
  );
}
const withDatabase = databaseUrl && migrationUrl ? describe : describe.skip;
withDatabase('real worker concurrent conversation recovery', () => {
  let db: DataSource;
  let migration: DataSource;
  let app: INestApplication;
  let url: string;
  let userId: string;
  let token: string;
  let projectId: string;
  const native = new NativeMultichatFixture();
  const readers: MultichatSnapshotReader[] = [];

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
              EXECUTION_WORKER_CONCURRENCY: 4,
              EXECUTION_MAX_ACTIVE_PER_USER: 4,
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
    }).compile();
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
      displayName: 'Multichat fixture',
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
      name: 'Multichat fixture',
    });
    projectId = project.id;
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
    await native.close();
    await Promise.allSettled(readers.map((reader) => reader.done));
    await app?.close();
    if (migration?.isInitialized) {
      if (userId) await migration.getRepository(UserEntity).delete(userId);
      await migration.destroy();
    }
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

  async function conversation(): Promise<string> {
    return (
      await db.getRepository(ConversationEntity).save({
        projectId,
        title: 'Concurrent fixture',
        titleSource: 'user',
      })
    ).id;
  }

  async function start(conversationId: string, submissionId = randomUUID()): Promise<string> {
    const response = await request(`/conversations/${conversationId}/executions`, {
      submissionId,
      message: `Deterministic work in ${conversationId}`,
    });
    expect(response.status).toBe(200);
    return executionSnapshotEnvelopeSchema.parse(await response.json()).data.snapshot.execution.id;
  }

  async function observe(executionId: string, cursor?: string) {
    const reader = new MultichatSnapshotReader();
    readers.push(reader);
    await reader.start(`${url}/executions/${executionId}/events`, token, cursor);
    return reader;
  }

  async function row(id: string) {
    return db.getRepository(ExecutionEntity).findOneByOrFail({ id });
  }

  async function snapshot(id: string) {
    const response = await request(`/executions/${id}`);
    expect(response.status).toBe(200);
    return executionSnapshotEnvelopeSchema.parse(await response.json()).data.snapshot;
  }

  async function dispatched(ids: string[]) {
    await until(() => ids.every((id) => native.joins.some((join) => join.executionId === id)));
  }

  async function terminal(ids: string[]) {
    await until(async () =>
      (await Promise.all(ids.map(row))).every((execution) =>
        ['completed', 'cancelled'].includes(execution.status),
      ),
    );
  }

  it('runs four chats independently, resumes dropped transport and frees capacity after Stop', async () => {
    const startedAt = Date.now();
    const conversationIds = await Promise.all(Array.from({ length: 5 }, conversation));
    const [a, b, c, d] = await Promise.all(conversationIds.slice(0, 4).map((id) => start(id)));
    const ids = [a!, b!, c!, d!];
    await dispatched(ids);
    expect(native.maxConcurrentStreams).toBe(4);
    expect(new Set(native.creates.slice(-4).map((run) => run.threadId)).size).toBe(4);
    const readerA = await observe(a!);
    const readerB = await observe(b!);
    const readerC = await observe(c!);
    const readerD = await observe(d!);
    const fifthSubmission = randomUUID();
    const rejected = await request(`/conversations/${conversationIds[4]!}/executions`, {
      submissionId: fifthSubmission,
      message: `Deterministic work in ${conversationIds[4]!}`,
    });
    expect(rejected.status).toBe(429);
    expect(await rejected.json()).toMatchObject({ error: { code: 'execution_capacity' } });

    // A is intentionally silent: B must still project and stream immediately.
    native.emit(b!, 'B starts');
    native.emit(c!, 'C independent');
    native.emit(d!, 'D independent');
    await until(() => readerB.snapshots.some((item) => item.assistantText === 'B starts'));
    expect(await snapshot(a!)).toMatchObject({
      assistantText: '',
      execution: { status: 'running' },
    });
    expect(await row(b!)).toMatchObject({ publicText: 'B starts', status: 'running' });
    const bWatermark = (await row(b!)).sourceWatermark;
    const beforeSnapshots = native.creates.length;
    await Promise.all(Array.from({ length: 12 }, (_, index) => snapshot(ids[index % ids.length]!)));
    expect(native.creates).toHaveLength(beforeSnapshots);

    // Browser detachment does not cancel A or interfere with B's native stream.
    const aCursor = readerA.snapshots.at(-1)!.cursor!;
    readerA.abort();
    await readerA.done;
    native.emit(a!, 'A retained');
    const replayA = await observe(a!, aCursor);
    await until(() => replayA.snapshots.some((item) => item.assistantText === 'A retained'));
    expect(native.cancels).toEqual([]);

    // Independent native transport loss: only B rejoins, at its committed watermark.
    native.dropStream(b!);
    native.emit(b!, ' resumes');
    await until(() => native.joins.filter((join) => join.executionId === b).length === 2);
    expect(native.joins.filter((join) => join.executionId === b).at(-1)?.after).toBe(bWatermark);
    await until(() => readerB.snapshots.some((item) => item.assistantText === 'B starts resumes'));
    expect(native.joins.filter((join) => join.executionId === a)).toHaveLength(1);
    expect(native.creates).toHaveLength(beforeSnapshots);

    const stopped = await request(`/executions/${a!}/stop`, {});
    expect(stopped.status).toBe(200);
    await until(async () => (await row(a!)).status === 'cancelled');
    expect(native.cancels).toEqual([a]);
    expect(await row(b!)).toMatchObject({ status: 'running', publicText: 'B starts resumes' });
    const e = await start(conversationIds[4]!, fifthSubmission);
    await dispatched([e]);
    native.emit(e, 'E admitted');
    native.emit(b!, ' finishes');
    for (const id of [b!, c!, d!, e]) native.complete(id);
    await terminal([...ids, e]);
    await Promise.all([readerB.done, readerC.done, readerD.done, replayA.done]);
    expect(replayA.snapshots.at(-1)).toMatchObject({
      assistantText: 'A retained',
      execution: { id: a, status: 'cancelled' },
    });
    for (const [reader, id, text] of [
      [readerB, b, 'B starts resumes finishes'],
      [readerC, c, 'C independent'],
      [readerD, d, 'D independent'],
    ] as const) {
      expect(reader.snapshots.at(-1)).toMatchObject({
        assistantText: text,
        execution: { id, status: 'completed' },
      });
    }

    const expected = new Map([
      [a!, 'A retained'],
      [b!, 'B starts resumes finishes'],
      [c!, 'C independent'],
      [d!, 'D independent'],
      [e, 'E admitted'],
    ]);
    for (const [id, text] of expected) {
      expect((await row(id)).publicText).toBe(text);
      expect((await snapshot(id)).assistantText).toBe(text);
      expect(
        (await db.getRepository(MessageEntity).findBy({ executionId: id, role: 'assistant' })).map(
          (message) => message.content,
        ),
      ).toEqual([text]);
      expect(native.creates.filter((create) => create.executionId === id)).toHaveLength(1);
    }
    for (const reader of [readerA, replayA, readerB, readerC, readerD]) {
      expect(reader.errors).toEqual([]);
      // The RUN_STARTED replica carries no state yet; every later one names the same execution.
      expect(
        new Set(reader.snapshots.flatMap((item) => (item.execution ? [item.execution.id] : [])))
          .size,
      ).toBe(1);
      // One attach per reader: every replica belongs to the single synthesized AG-UI run.
      expect(reader.snapshots.every((item) => item.runs === 1)).toBe(true);
    }
    process.stdout.write(
      'ALFRED_MULTICHAT_RESULT ' +
        JSON.stringify({
          elapsedMs: Date.now() - startedAt,
          concurrentNativeStreams: native.maxConcurrentStreams,
          nativeCreates: expected.size,
          nativeJoins: native.joins.length,
          cancelledOnlyA: native.cancels.length === 1,
          boundary:
            'Real ExecutionRecoveryWorker, Nest API, PostgreSQL, native HTTP adapter and public SSE; deterministic native protocol fixture.',
        }) +
        '\n',
    );
  }, 30_000);

  (soakRequested ? it : it.skip)(
    'keeps two conversations independent for the requested wall-clock duration',
    async () => {
      const [conversationA, conversationB] = await Promise.all([conversation(), conversation()]);
      const [a, b] = await Promise.all([start(conversationA), start(conversationB)]);
      await dispatched([a, b]);
      const startedAt = Date.now();
      const createBaseline = native.creates.length;
      const readerA = await observe(a);
      const readerB = await observe(b);
      native.emit(a, 'A long');
      native.emit(b, 'B long');
      await until(
        () =>
          readerA.snapshots.some((item) => item.assistantText === 'A long') &&
          readerB.snapshots.some((item) => item.assistantText === 'B long'),
      );
      await at(startedAt, durationMs * 0.25);
      const cursor = readerA.snapshots.at(-1)!.cursor!;
      readerA.abort();
      await readerA.done;
      const bWatermark = (await row(b)).sourceWatermark;
      native.dropStream(b);
      native.emit(b, ' recovered');
      await until(() => native.joins.filter((join) => join.executionId === b).length === 2);
      expect(native.joins.filter((join) => join.executionId === b).at(-1)?.after).toBe(bWatermark);
      await until(() =>
        readerB.snapshots.some((item) => item.assistantText === 'B long recovered'),
      );
      expect(await row(a)).toMatchObject({ status: 'running', publicText: 'A long' });
      await at(startedAt, durationMs * 0.55);
      native.emit(a, ' restored');
      const replayA = await observe(a, cursor);
      await until(() => replayA.snapshots.some((item) => item.assistantText === 'A long restored'));
      await at(startedAt, durationMs * 0.75);
      const beforeQuiet = [replayA.snapshots.length, readerB.snapshots.length];
      await at(startedAt, durationMs);
      expect([replayA.snapshots.length, readerB.snapshots.length]).toEqual(beforeQuiet);
      native.emit(a, ' done');
      native.emit(b, ' done');
      native.complete(a);
      native.complete(b);
      await terminal([a, b]);
      await Promise.all([replayA.done, readerB.done]);
      expect(replayA.snapshots.at(-1)).toMatchObject({
        assistantText: 'A long restored done',
        execution: { id: a, status: 'completed' },
      });
      expect(readerB.snapshots.at(-1)).toMatchObject({
        assistantText: 'B long recovered done',
        execution: { id: b, status: 'completed' },
      });
      expect(await snapshot(a)).toMatchObject({
        assistantText: 'A long restored done',
        execution: { status: 'completed' },
      });
      expect(await snapshot(b)).toMatchObject({
        assistantText: 'B long recovered done',
        execution: { status: 'completed' },
      });
      expect(native.creates).toHaveLength(createBaseline);
      expect(native.creates.filter((create) => [a, b].includes(create.executionId))).toHaveLength(
        2,
      );
      expect(native.cancels.filter((id) => [a, b].includes(id))).toEqual([]);
      const maxByteGapMs = Math.max(
        ...[readerA, replayA, readerB].map((reader) => reader.maxByteGapMs),
      );
      for (const reader of [readerA, replayA, readerB]) expect(reader.errors).toEqual([]);
      expect(maxByteGapMs).toBeLessThan(35_000);
      process.stdout.write(
        'ALFRED_MULTICHAT_SOAK_RESULT ' +
          JSON.stringify({
            requestedMs: durationMs,
            elapsedMs: Date.now() - startedAt,
            maxByteGapMs,
            nativeCreates: 2,
            nativeJoins: native.joins
              .filter((join) => [a, b].includes(join.executionId))
              .map((join) => ({
                execution: join.executionId === a ? 'A' : 'B',
                after: join.after,
                atMs: join.at - startedAt,
              })),
            boundary:
              'Real worker with real clocks, Nest API, PostgreSQL and SSE; deterministic native protocol fixture, no live provider.',
          }) +
          '\n',
      );
    },
    durationMs + 30_000,
  );
});

async function until(check: () => boolean | Promise<boolean>, timeoutMs = 12_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for multichat condition');
    await delay(20);
  }
}

async function at(startedAt: number, offsetMs: number): Promise<void> {
  await delay(Math.max(0, startedAt + offsetMs - Date.now()));
}
