import type { ConfigService } from '@nestjs/config';
import { vi } from 'vitest';
import { ExecutionProcessor } from '@api/modules/executions/application/execution-processor';
import { ExecutionStreamConsumer } from '@api/modules/executions/application/execution-stream.consumer';
import type {
  RuntimeClient,
  RuntimeRun,
} from '@api/modules/executions/application/runtime-client.port';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, afterEach, describe, expect, it } from 'vitest';
import { API_MIGRATIONS_TABLE } from '@api/database/database-options';
import { databaseMigrations } from '@api/database/migrations';
import { databaseEntities } from '@api/database/typeorm.options';
import { DurableRuntimeExecutions1789400000000 } from '@api/database/migrations/1789400000000-durable-runtime-executions';
import { ExecutionsService } from '@api/modules/executions/application/executions.service';
import { ConversationsService } from '@api/modules/conversations/application/conversations.service';
import { ConversationEntity } from '@api/modules/conversations/infrastructure/persistence/conversation.entity';
import { ProjectEntity } from '@api/modules/projects/infrastructure/persistence/project.entity';
import { TenantEntity } from '@api/modules/tenants/tenant.entity';
import { TenantsService } from '@api/modules/tenants/tenants.service';
import { UserEntity } from '@api/modules/users/user.entity';
import { ExecutionLeaseStore } from '@api/modules/executions/infrastructure/persistence/execution-lease.store';
import { ExecutionStateStore } from '@api/modules/executions/infrastructure/persistence/execution-state.store';
import { ExecutionEntity } from '@api/modules/executions/infrastructure/persistence/execution.entity';
import { RuntimeThreadEntity } from '@api/modules/executions/infrastructure/persistence/runtime-thread.entity';
import { MessageEntity } from '@api/modules/executions/infrastructure/persistence/message.entity';

const url = process.env.TEST_DATABASE_URL;
const postgres = url && process.env.TEST_MIGRATION_DATABASE_URL ? describe : describe.skip;
postgres('durable execution PostgreSQL lifecycle', () => {
  let db: DataSource;
  let commands: ExecutionsService;
  let leases: ExecutionLeaseStore;
  let states: ExecutionStateStore;
  let tenantId: string;
  const users = new Set<string>();

  beforeAll(async () => {
    const migrations = [...databaseMigrations].filter(
      (m) => m.name !== DurableRuntimeExecutions1789400000000.name,
    );
    db = new DataSource({
      type: 'postgres',
      url: process.env.TEST_MIGRATION_DATABASE_URL!,
      entities: [...databaseEntities],
      migrations: [...migrations, DurableRuntimeExecutions1789400000000],
      migrationsTableName: API_MIGRATIONS_TABLE,
      synchronize: false,
      migrationsRun: false,
    });
    await db.initialize();
    await db.runMigrations({ transaction: 'each' });
    tenantId = (await db.getRepository(TenantEntity).findOneByOrFail({ slug: 'default' })).id;
    const tenants = new TenantsService(db);
    commands = new ExecutionsService(db, tenants, new ConversationsService(db, tenants));
    leases = new ExecutionLeaseStore(db);
    states = new ExecutionStateStore(db);
  });
  afterEach(async () => {
    for (const id of users) await db.getRepository(UserEntity).delete(id);
    users.clear();
  });
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });
  async function fixture() {
    const id = randomUUID();
    users.add(id);
    await db
      .getRepository(UserEntity)
      .insert({ id, tenantId, email: `${id}@example.test`, displayName: 'SSE fixture' });
    const project = await db
      .getRepository(ProjectEntity)
      .save({ tenantId, ownerUserId: id, kind: 'named', name: 'Fixture' });
    const conversation = await db
      .getRepository(ConversationEntity)
      .save({ projectId: project.id, title: 'Fixture', titleSource: 'user' });
    const principal = {
      id,
      email: `${id}@example.test`,
      sessionId: randomUUID(),
      role: 'user' as const,
    };
    return { principal, project, conversation };
  }
  async function started() {
    const f = await fixture();
    const result = await commands.start(f.principal, f.conversation.id, 'Hello', {
      submissionId: randomUUID(),
      profile: 'application/vnd.alfred.execution+json;version=1',
    });
    return { ...f, execution: result.execution };
  }

  it('applies and reverses the explicit migration with zero TypeORM schema drift', async () => {
    expect((await db.driver.createSchemaBuilder().log()).upQueries.map((q) => q.query)).toEqual([]);
    const runner = db.createQueryRunner();
    try {
      const migration = new DurableRuntimeExecutions1789400000000();
      await migration.down(runner);
      await migration.up(runner);
    } finally {
      await runner.release();
    }
    expect((await db.driver.createSchemaBuilder().log()).upQueries.map((q) => q.query)).toEqual([]);
  });
  it('simultaneous retries persist one intent and one user turn, while changed payload conflicts', async () => {
    const f = await fixture();
    const submissionId = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        commands.start(f.principal, f.conversation.id, 'Hello', {
          submissionId,
          profile: 'durable-v1',
        }),
      ),
    );
    expect(new Set(results.map((r) => r.execution.id)).size).toBe(1);
    expect(
      await db
        .getRepository(MessageEntity)
        .countBy({ conversationId: f.conversation.id, role: 'user' }),
    ).toBe(1);
    await expect(
      commands.start(f.principal, f.conversation.id, 'Changed', {
        submissionId,
        profile: 'durable-v1',
      }),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
  });
  it('replica claims are exclusive and a successor fences projection from the crashed worker', async () => {
    const f = await started();
    const claims = await Promise.all([
      leases.claim('worker-a', 30000),
      leases.claim('worker-b', 30000),
    ]);
    const old = claims.find((c) => c !== null)!;
    expect(claims.filter(Boolean)).toHaveLength(1);
    await db.query(
      'UPDATE "api_executions" SET "lease_expires_at" = clock_timestamp() - interval \'1 second\' WHERE "id"=$1',
      [f.execution.id],
    );
    const current = (await leases.claim('worker-c', 30000))!;
    expect(current.leaseVersion).toBe(old.leaseVersion + 1);
    expect(await leases.renew(old, 30000)).toBe(false);
    await expect(
      states.update(old, { publicText: 'stale', sourceWatermark: '1', projectionRevision: 1 }),
    ).rejects.toThrow('lease or authority');
    await states.update(current, {
      publicText: 'Hello',
      sourceWatermark: '1',
      projectionRevision: 1,
      reducerState: { sequence: 1 },
    });
    await states.update(current, {
      publicText: 'Hello world',
      sourceWatermark: '2',
      projectionRevision: 2,
      reducerState: { sequence: 2 },
    });
    const messages = await db
      .getRepository(MessageEntity)
      .findBy({ executionId: f.execution.id, role: 'assistant' });
    expect(messages.map((m) => m.content)).toEqual(['Hello world']);
    expect(
      await db.getRepository(ExecutionEntity).findOneByOrFail({ id: f.execution.id }),
    ).toMatchObject({ sourceWatermark: '2', projectionRevision: 2, reducerState: { sequence: 2 } });
  });
  it('rolls back transcript, watermark and reducer together when the projection update fails', async () => {
    const f = await started();
    const claimed = (await leases.claim('worker-a', 30000))!;
    // Database check, after the transcript upsert, forces the complete transaction to roll back.
    await expect(
      states.update(claimed, {
        publicText: 'Must roll back',
        sourceWatermark: '1',
        projectionRevision: -1,
      }),
    ).rejects.toThrow();
    expect(
      await db
        .getRepository(MessageEntity)
        .countBy({ executionId: f.execution.id, role: 'assistant' }),
    ).toBe(0);
    expect(
      await db.getRepository(ExecutionEntity).findOneByOrFail({ id: f.execution.id }),
    ).toMatchObject({ sourceWatermark: null, projectionRevision: 0, publicText: '' });
  });
  it('supersedes a stalled execution past its deadline and persists Stop idempotently on advancing work', async () => {
    const f = await started();
    const first = await commands.stop(f.principal, f.execution.id);
    const second = await commands.stop(f.principal, f.execution.id);
    expect(first.status).toBe('stopping');
    expect(second.stopRequestedAt).toEqual(first.stopRequestedAt);
    await expect(
      commands.start(f.principal, f.conversation.id, 'Next', {
        submissionId: randomUUID(),
        profile: 'durable-v1',
      }),
    ).rejects.toMatchObject({ code: 'thread_busy' });
    await db.getRepository(ExecutionEntity).update(f.execution.id, {
      deadlineAt: new Date(Date.now() - 1000),
      dispatchState: 'unknown',
      status: 'recovering',
    });
    const replacement = await commands.start(f.principal, f.conversation.id, 'Next', {
      submissionId: randomUUID(),
      profile: 'durable-v1',
    });
    expect(replacement.execution.id).not.toBe(f.execution.id);
    const superseded = await db
      .getRepository(ExecutionEntity)
      .findOneByOrFail({ id: f.execution.id });
    expect(superseded).toMatchObject({ status: 'cancelled', error: 'superseded' });
    expect(superseded.finishedAt).toBeInstanceOf(Date);
    expect(await commands.active(f.principal, f.conversation.id)).toMatchObject({
      id: replacement.execution.id,
    });
  });

  it('lets a new message supersede a parked interrupted execution while two racing messages admit one', async () => {
    const f = await started();
    const claimed = (await leases.claim('worker', 30000))!;
    await states.update(claimed, { status: 'interrupted', error: 'runtime_interrupted' });
    const submit = () =>
      commands.start(f.principal, f.conversation.id, 'Again', {
        submissionId: randomUUID(),
        profile: 'durable-v1',
      });
    const results = await Promise.allSettled([submit(), submit()]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'thread_busy' },
    });
    expect(
      await db.getRepository(ExecutionEntity).findOneByOrFail({ id: f.execution.id }),
    ).toMatchObject({ status: 'cancelled', error: 'superseded' });
    // The stale worker's fence is gone: its writes are refused and nothing resurrects the row.
    await expect(states.update(claimed, { publicText: 'late' })).rejects.toThrow(
      'lease or authority',
    );
  });
  it('rejects a superseded binding and a disabled account', async () => {
    const f = await started();
    const claimed = (await leases.claim('worker-a', 30000))!;
    await db
      .getRepository(RuntimeThreadEntity)
      .update(f.conversation.id, { generation: randomUUID() });
    await expect(states.update(claimed, { publicText: 'forbidden' })).rejects.toThrow(
      'lease or authority',
    );
    await expect(commands.getObservation(f.principal, f.execution.id)).rejects.toMatchObject({
      code: 'execution_binding_changed',
    });
    await db.getRepository(UserEntity).update(f.principal.id, { status: 'disabled' });
    await expect(commands.resolveRuntime(f.execution.id, f.execution.invocationId)).rejects.toThrow(
      'Account is unavailable',
    );
  });
  it('global admission serialization enforces the per-user limit across distinct conversations', async () => {
    const f = await fixture();
    const conversations = await db.getRepository(ConversationEntity).save(
      Array.from({ length: 5 }, () => ({
        projectId: f.project.id,
        title: 'Fixture',
        titleSource: 'user' as const,
      })),
    );
    const results = await Promise.allSettled(
      conversations.map((c) =>
        commands.start(f.principal, c.id, 'Hello', {
          submissionId: randomUUID(),
          profile: 'durable-v1',
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(4);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'execution_capacity' },
    });
  });
  it('recovers a lost dispatch response and committed source watermark after worker replacement', async () => {
    const f = await started();
    const run: RuntimeRun = {
      executionId: f.execution.id,
      invocationId: f.execution.invocationId,
      threadId: f.execution.runtimeThreadId!,
      runId: randomUUID(),
      status: 'success',
      stopRequested: false,
      replayAvailable: true,
    };
    let joins = 0;
    const dispatch = vi.fn().mockRejectedValue(new Error('response lost after runtime acceptance'));
    const join = vi.fn(async function* (
      _id: string,
      _invocation: string,
      options: { after: string | null },
    ) {
      await Promise.resolve();
      joins += 1;
      if (options.after === null) {
        yield {
          id: '1',
          event: 'messages-tuple',
          data: [{ id: 'answer', type: 'AIMessageChunk', content: 'Hello' }, {}],
        };
        throw new Error('API transport interrupted after commit');
      }
      // Native replay can repeat its anchor. Serializable reducer deduplicates it.
      if (options.after === '1') {
        yield {
          id: '1',
          event: 'messages-tuple',
          data: [{ id: 'answer', type: 'AIMessageChunk', content: 'Hello' }, {}],
        };
        yield {
          id: '2',
          event: 'messages-tuple',
          data: [{ id: 'answer', type: 'AIMessageChunk', content: ' world' }, {}],
        };
      }
      // A rejoin from the last committed watermark yields nothing more: the source is drained.
    });
    const runtime = {
      dispatch,
      join,
      inspect: vi.fn().mockResolvedValue(run),
      cancel: vi.fn().mockResolvedValue(run),
      generateTitle: vi.fn().mockResolvedValue(null),
    } as unknown as RuntimeClient;
    const config = { get: vi.fn() } as unknown as ConfigService;
    for (const worker of ['first', 'second', 'third']) {
      const claimed = (await leases.claim(worker, 30000))!;
      await new ExecutionProcessor(
        states,
        leases,
        runtime,
        config,
        new ExecutionStreamConsumer(states, runtime, config),
      ).process(claimed);
      await leases.release(claimed, 0);
    }
    expect(dispatch).toHaveBeenCalledOnce();
    expect(joins).toBe(3);
    expect(join.mock.calls.map(([, , options]) => options.after)).toEqual([null, '1', '2']);
    const persisted = await db
      .getRepository(ExecutionEntity)
      .findOneByOrFail({ id: f.execution.id });
    expect(persisted).toMatchObject({
      status: 'completed',
      runtimeRunId: run.runId,
      sourceWatermark: '2',
      projectionRevision: 2,
      publicText: 'Hello world',
    });
    expect(
      (
        await db
          .getRepository(MessageEntity)
          .findBy({ executionId: f.execution.id, role: 'assistant' })
      ).map((m) => m.content),
    ).toEqual(['Hello world']);
  });

  it('revoking the owner blocks subsequent projection commits and trusted runtime resolution', async () => {
    const f = await started();
    const claimed = (await leases.claim('worker', 30000))!;
    await db.getRepository(UserEntity).update(f.principal.id, { status: 'disabled' });
    await expect(states.update(claimed, { publicText: 'must not become visible' })).rejects.toThrow(
      'lease or authority',
    );
    await expect(commands.resolveRuntime(f.execution.id, f.execution.invocationId)).rejects.toThrow(
      'Account is unavailable',
    );
    expect(
      await db
        .getRepository(MessageEntity)
        .countBy({ executionId: f.execution.id, role: 'assistant' }),
    ).toBe(0);
  });

  it('shows a parked execution on discovery, supersedes it on the next message and frees deletion', async () => {
    const f = await started();
    const claimed = (await leases.claim('worker', 30000))!;
    await states.update(claimed, {
      status: 'recovery_required',
      error: 'runtime_recovery_gap',
      stopRequestedAt: new Date(),
      publicText: 'Saved before the gap',
    });
    expect(await commands.active(f.principal, f.conversation.id)).toMatchObject({
      id: f.execution.id,
      status: 'recovery_required',
    });
    const conversations = new ConversationsService(db, new TenantsService(db));
    // Parked work never blocks the user: deletion and a new message are both admitted.
    const replacement = await commands.start(f.principal, f.conversation.id, 'Next', {
      submissionId: randomUUID(),
      profile: 'durable-v1',
    });
    expect(replacement.execution.id).not.toBe(f.execution.id);
    expect(
      await db.getRepository(ExecutionEntity).findOneByOrFail({ id: f.execution.id }),
    ).toMatchObject({
      status: 'cancelled',
      error: 'superseded',
      publicText: 'Saved before the gap',
    });
    expect(await commands.active(f.principal, f.conversation.id)).toMatchObject({
      id: replacement.execution.id,
    });
    // The replacement is genuinely advancing: it still protects the conversation.
    await expect(conversations.remove(f.principal, f.conversation.id)).rejects.toMatchObject({
      code: 'thread_busy',
    });
    await db.getRepository(ExecutionEntity).update(replacement.execution.id, {
      status: 'completed',
      finishedAt: new Date(),
    });
    await expect(conversations.remove(f.principal, f.conversation.id)).resolves.toBeUndefined();
  });

  it('abandons an execution whose owner is disabled mid-stream instead of re-claiming it forever', async () => {
    const f = await started();
    const run: RuntimeRun = {
      executionId: f.execution.id,
      invocationId: f.execution.invocationId,
      threadId: f.execution.runtimeThreadId!,
      runId: randomUUID(),
      status: 'running',
      stopRequested: false,
      replayAvailable: true,
    };
    const cancel = vi.fn().mockRejectedValue(new Error('SYNTHETIC authority failure'));
    const join = vi.fn(async function* () {
      await db.getRepository(UserEntity).update(f.principal.id, { status: 'disabled' });
      yield {
        id: '1',
        event: 'messages-tuple',
        data: [{ id: 'answer', type: 'AIMessageChunk', content: 'Hello' }, {}],
      };
    });
    const runtime = {
      dispatch: vi.fn().mockResolvedValue(run),
      inspect: vi.fn().mockResolvedValue(run),
      cancel,
      join,
      generateTitle: vi.fn().mockResolvedValue(null),
    } as unknown as RuntimeClient;
    const config = { get: vi.fn() } as unknown as ConfigService;
    const claimed = (await leases.claim('worker', 30000))!;
    await new ExecutionProcessor(
      states,
      leases,
      runtime,
      config,
      new ExecutionStreamConsumer(states, runtime, config),
    ).process(claimed);
    expect(cancel).toHaveBeenCalledOnce();
    const persisted = await db
      .getRepository(ExecutionEntity)
      .findOneByOrFail({ id: f.execution.id });
    expect(persisted).toMatchObject({ status: 'cancelled', error: 'execution_authority_lost' });
    expect(persisted.finishedAt).toBeInstanceOf(Date);
    expect(persisted.stopRequestedAt).toBeInstanceOf(Date);
    await leases.release(claimed, 0);
    expect(await leases.claim('successor', 30000)).toBeNull();
    expect(
      await db
        .getRepository(MessageEntity)
        .countBy({ executionId: f.execution.id, role: 'assistant' }),
    ).toBe(0);
  });

  it('applies a generated title after completion without the fence and never over a user rename', async () => {
    const f = await fixture();
    const untitled = await db
      .getRepository(ConversationEntity)
      .save({ projectId: f.project.id, title: 'Provisional', titleSource: 'none' });
    const started = await commands.start(f.principal, untitled.id, 'Hello there', {
      submissionId: randomUUID(),
      profile: 'durable-v1',
    });
    expect(started.execution.titleRequested).toBe(true);
    const claimed = (await leases.claim('worker', 30000))!;
    await states.update(claimed, { status: 'completed', finishedAt: new Date(), publicText: 'Hi' });
    await states.applyTitle(started.execution, 'Generated title');
    expect(
      await db.getRepository(ConversationEntity).findOneByOrFail({ id: untitled.id }),
    ).toMatchObject({ title: 'Generated title', titleSource: 'auto' });
    expect(
      await db.getRepository(ExecutionEntity).findOneByOrFail({ id: started.execution.id }),
    ).toMatchObject({ titleRequested: false, status: 'completed' });
    const renamed = await started_user_conversation(f);
    await states.applyTitle(renamed.execution, 'Must not replace');
    expect(
      await db.getRepository(ConversationEntity).findOneByOrFail({ id: f.conversation.id }),
    ).toMatchObject({ title: 'Fixture', titleSource: 'user' });
    expect(
      await db.getRepository(ExecutionEntity).findOneByOrFail({ id: renamed.execution.id }),
    ).toMatchObject({ titleRequested: false });
  });

  async function started_user_conversation(f: Awaited<ReturnType<typeof fixture>>) {
    const result = await commands.start(f.principal, f.conversation.id, 'Hello', {
      submissionId: randomUUID(),
      profile: 'durable-v1',
    });
    return { execution: result.execution };
  }
});
