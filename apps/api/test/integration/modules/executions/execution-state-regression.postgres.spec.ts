import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { API_MIGRATIONS_TABLE } from '@api/database/database-options';
import { databaseMigrations } from '@api/database/migrations';
import { databaseEntities } from '@api/database/typeorm.options';
import { ConversationsService } from '@api/modules/conversations/application/conversations.service';
import { ConversationEntity } from '@api/modules/conversations/infrastructure/persistence/conversation.entity';
import { ExecutionsService } from '@api/modules/executions/application/executions.service';
import { ExecutionLeaseStore } from '@api/modules/executions/infrastructure/persistence/execution-lease.store';
import { ExecutionStateStore } from '@api/modules/executions/infrastructure/persistence/execution-state.store';
import { ExecutionEntity } from '@api/modules/executions/infrastructure/persistence/execution.entity';
import { MessageEntity } from '@api/modules/executions/infrastructure/persistence/message.entity';
import { ProjectEntity } from '@api/modules/projects/infrastructure/persistence/project.entity';
import { TenantEntity } from '@api/modules/tenants/tenant.entity';
import { TenantsService } from '@api/modules/tenants/tenants.service';
import { UserEntity } from '@api/modules/users/user.entity';

const postgres =
  process.env.TEST_DATABASE_URL && process.env.TEST_MIGRATION_DATABASE_URL
    ? describe
    : describe.skip;

postgres('durable execution transaction and conversation isolation regressions', () => {
  let db: DataSource;
  let commands: ExecutionsService;
  let leases: ExecutionLeaseStore;
  let states: ExecutionStateStore;
  let tenantId: string;
  const owners = new Set<string>();

  beforeAll(async () => {
    db = new DataSource({
      type: 'postgres',
      url: process.env.TEST_MIGRATION_DATABASE_URL!,
      entities: [...databaseEntities],
      migrations: [...databaseMigrations],
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
    for (const owner of owners) await db.getRepository(UserEntity).delete(owner);
    owners.clear();
  });
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  async function fixture() {
    const id = randomUUID();
    owners.add(id);
    await db
      .getRepository(UserEntity)
      .insert({ id, tenantId, email: `${id}@example.test`, displayName: 'Regression fixture' });
    const project = await db
      .getRepository(ProjectEntity)
      .save({ tenantId, ownerUserId: id, kind: 'named', name: 'Regression fixture' });
    const conversation = await db
      .getRepository(ConversationEntity)
      .save({ projectId: project.id, title: 'User title', titleSource: 'user' });
    const principal = {
      id,
      email: `${id}@example.test`,
      sessionId: randomUUID(),
      role: 'user' as const,
    };
    const start = (
      conversationId = conversation.id,
      submissionId = randomUUID(),
      message = 'Hello',
    ) =>
      commands.start(principal, conversationId, message, { submissionId, profile: 'durable-v1' });
    const secondConversation = () =>
      db
        .getRepository(ConversationEntity)
        .save({ projectId: project.id, title: 'Second', titleSource: 'user' as const });
    return { principal, project, conversation, start, secondConversation };
  }
  const execution = (id: string) => db.getRepository(ExecutionEntity).findOneByOrFail({ id });
  const assistantMessages = (executionId: string) =>
    db.getRepository(MessageEntity).findBy({ executionId, role: 'assistant' });
  const expire = (id: string) =>
    db.query(
      `UPDATE "api_executions" SET "lease_expires_at" = clock_timestamp() - interval '1 second' WHERE "id"=$1`,
      [id],
    );

  it('admits exactly one of two different submissions racing for the same conversation', async () => {
    const f = await fixture();
    const results = await Promise.allSettled([f.start(), f.start()]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'thread_busy' },
    });
    expect(
      await db
        .getRepository(MessageEntity)
        .countBy({ conversationId: f.conversation.id, role: 'user' }),
    ).toBe(1);
    expect(
      await db.getRepository(ExecutionEntity).countBy({ conversationId: f.conversation.id }),
    ).toBe(1);
  });

  it('scopes a repeated submission ID to each conversation and assigns independent native identities', async () => {
    const f = await fixture();
    const second = await f.secondConversation();
    const submissionId = randomUUID();
    const [a, b] = await Promise.all([
      f.start(f.conversation.id, submissionId),
      f.start(second.id, submissionId),
    ]);
    expect(a.execution.id).not.toBe(b.execution.id);
    expect(a.execution.invocationId).not.toBe(b.execution.invocationId);
    expect(a.execution.runtimeThreadId).not.toBe(b.execution.runtimeThreadId);
    expect(a.execution.bindingGeneration).not.toBe(b.execution.bindingGeneration);
    expect(await commands.active(f.principal, f.conversation.id)).toMatchObject({
      id: a.execution.id,
    });
    expect(await commands.active(f.principal, second.id)).toMatchObject({ id: b.execution.id });
  });

  it('retries a completed submission without replacing the newer active turn or its deadline', async () => {
    const f = await fixture();
    const submissionId = randomUUID();
    const old = await f.start(f.conversation.id, submissionId);
    const claimed = (await leases.claim('old-worker', 30_000))!;
    await states.update(claimed, {
      status: 'completed',
      finishedAt: new Date(),
      publicText: 'Done',
    });
    const current = await f.start();
    const retry = await f.start(f.conversation.id, submissionId);
    expect(retry.execution.id).toBe(old.execution.id);
    expect(retry.execution.deadlineAt).toEqual(old.execution.deadlineAt);
    expect(await commands.active(f.principal, f.conversation.id)).toMatchObject({
      id: current.execution.id,
    });
    expect(
      await db
        .getRepository(MessageEntity)
        .countBy({ conversationId: f.conversation.id, role: 'user' }),
    ).toBe(2);
  });

  it('rejects a changed response profile for the same submission without appending another user turn', async () => {
    const f = await fixture();
    const submissionId = randomUUID();
    await f.start(f.conversation.id, submissionId);
    await expect(
      commands.start(f.principal, f.conversation.id, 'Hello', {
        submissionId,
        profile: 'another-profile',
      }),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
    expect(
      await db
        .getRepository(MessageEntity)
        .countBy({ conversationId: f.conversation.id, role: 'user' }),
    ).toBe(1);
  });

  it.each(['running', 'recovering'] as const)(
    'preserves Stop against a stale worker %s update while accepting committed progress',
    async (status) => {
      const f = await fixture();
      const started = await f.start();
      const claimed = (await leases.claim('worker', 30_000))!;
      const stopped = await commands.stop(f.principal, started.execution.id);
      const updated = await states.update(claimed, {
        status,
        publicText: 'Partial',
        sourceWatermark: 'source-1',
        projectionRevision: 1,
      });
      expect(updated).toMatchObject({
        status: 'stopping',
        stopRequestedAt: stopped.stopRequestedAt,
        publicText: 'Partial',
      });
      expect((await assistantMessages(started.execution.id)).map((row) => row.content)).toEqual([
        'Partial',
      ]);
    },
  );

  it('serializes simultaneous Stop and projection commits without losing either intent or partial output', async () => {
    const f = await fixture();
    const started = await f.start();
    const claimed = (await leases.claim('worker', 30_000))!;
    await Promise.all([
      commands.stop(f.principal, started.execution.id),
      states.update(claimed, {
        status: 'running',
        publicText: 'Saved while stopping',
        sourceWatermark: 'source-1',
        projectionRevision: 1,
      }),
    ]);
    const stored = await execution(started.execution.id);
    expect(stored).toMatchObject({
      status: 'stopping',
      publicText: 'Saved while stopping',
      sourceWatermark: 'source-1',
      projectionRevision: 1,
    });
    expect(stored.stopRequestedAt).toBeInstanceOf(Date);
    expect((await assistantMessages(stored.id)).map((row) => row.content)).toEqual([
      'Saved while stopping',
    ]);
  });

  it.each(['completed', 'failed', 'cancelled', 'timed_out'] as const)(
    'never resurrects a %s execution through a late worker write, Stop or retry claim',
    async (status) => {
      const f = await fixture();
      const started = await f.start();
      const claimed = (await leases.claim('worker', 30_000))!;
      const terminal = await states.update(claimed, {
        status,
        finishedAt: new Date(),
        publicText: 'Final saved text',
      });
      await expect(
        states.update(claimed, { status: 'running', publicText: 'Late text' }),
      ).rejects.toThrow('lease or authority');
      expect(await commands.stop(f.principal, started.execution.id)).toMatchObject({
        status,
        finishedAt: terminal.finishedAt,
        stopRequestedAt: null,
      });
      await leases.release(claimed, 0);
      expect(await leases.claim('successor', 30_000)).toBeNull();
      expect(await commands.active(f.principal, f.conversation.id)).toBeNull();
      expect((await assistantMessages(started.execution.id)).map((row) => row.content)).toEqual([
        'Final saved text',
      ]);
    },
  );

  it('ignores a late lease release from the old worker after another worker has taken ownership', async () => {
    const f = await fixture();
    const started = await f.start();
    const old = (await leases.claim('old-worker', 30_000))!;
    await expire(started.execution.id);
    const current = (await leases.claim('current-worker', 30_000))!;
    await leases.release(old, 60_000);
    expect(await execution(started.execution.id)).toMatchObject({
      leaseOwner: current.leaseOwner,
      leaseVersion: current.leaseVersion,
      leaseExpiresAt: current.leaseExpiresAt,
    });
    expect(await leases.renew(current, 30_000)).toBe(true);
    expect(await leases.claim('third-worker', 30_000)).toBeNull();
  });

  it('rejects an expired fence even before any successor exists', async () => {
    const f = await fixture();
    const started = await f.start();
    const old = (await leases.claim('worker', 30_000))!;
    await expire(started.execution.id);
    expect(await leases.renew(old, 30_000)).toBe(false);
    await expect(
      states.update(old, { publicText: 'Expired output' }, 'Expired title'),
    ).rejects.toThrow('lease or authority');
    expect(await assistantMessages(started.execution.id)).toEqual([]);
    expect(
      await db.getRepository(ConversationEntity).findOneByOrFail({ id: f.conversation.id }),
    ).toMatchObject({ title: 'User title' });
  });

  it('honors persisted retry backoff and claims the original invocation only after it becomes due', async () => {
    const f = await fixture();
    const started = await f.start();
    const old = (await leases.claim('worker', 30_000))!;
    await leases.release(old, 60_000);
    expect(await leases.claim('too-early', 30_000)).toBeNull();
    await db
      .getRepository(ExecutionEntity)
      .update(started.execution.id, { nextAttemptAt: new Date(Date.now() - 1_000) });
    expect(await leases.claim('successor', 30_000)).toMatchObject({
      id: started.execution.id,
      invocationId: old.invocationId,
      leaseVersion: old.leaseVersion + 1,
    });
  });

  it.each(['project', 'conversation'] as const)(
    'blocks late projection and native resolution when its %s was archived',
    async (resource) => {
      const f = await fixture();
      const started = await f.start();
      const claimed = (await leases.claim('worker', 30_000))!;
      if (resource === 'project')
        await db
          .getRepository(ProjectEntity)
          .update(f.project.id, { status: 'archived', archivedAt: new Date() });
      else
        await db
          .getRepository(ConversationEntity)
          .update(f.conversation.id, { archivedAt: new Date() });
      await expect(states.update(claimed, { publicText: 'No longer authorized' })).rejects.toThrow(
        'lease or authority',
      );
      await expect(
        commands.resolveRuntime(started.execution.id, started.execution.invocationId),
      ).rejects.toMatchObject({ code: 'execution_authority_lost' });
      expect(await assistantMessages(started.execution.id)).toEqual([]);
    },
  );

  it('does not overwrite a user title when a late generated title and answer arrive together', async () => {
    const f = await fixture();
    const started = await f.start();
    const claimed = (await leases.claim('worker', 30_000))!;
    await states.update(
      claimed,
      { publicText: 'Answer', titleRequested: false },
      'Late generated title',
    );
    expect(
      await db.getRepository(ConversationEntity).findOneByOrFail({ id: f.conversation.id }),
    ).toMatchObject({ title: 'User title', titleSource: 'user' });
    expect((await assistantMessages(started.execution.id)).map((row) => row.content)).toEqual([
      'Answer',
    ]);
  });

  it('rolls back generated title together with the failed projection transaction', async () => {
    const f = await fixture();
    await db
      .getRepository(ConversationEntity)
      .update(f.conversation.id, { title: 'Provisional', titleSource: 'auto' });
    const started = await f.start();
    const claimed = (await leases.claim('worker', 30_000))!;
    await expect(
      states.update(
        claimed,
        { publicText: 'Uncommitted', projectionRevision: -1 },
        'Uncommitted title',
      ),
    ).rejects.toThrow();
    expect(
      await db.getRepository(ConversationEntity).findOneByOrFail({ id: f.conversation.id }),
    ).toMatchObject({ title: 'Provisional', titleSource: 'auto' });
    expect(await assistantMessages(started.execution.id)).toEqual([]);
    expect(await execution(started.execution.id)).toMatchObject({
      publicText: '',
      projectionRevision: 0,
    });
  });

  it('stopping one conversation cannot alter another concurrent conversation with the same owner and input', async () => {
    const f = await fixture();
    const second = await f.secondConversation();
    const a = await f.start();
    const b = await f.start(second.id);
    const claims = await Promise.all([
      leases.claim('worker-a', 30_000),
      leases.claim('worker-b', 30_000),
    ]);
    const aClaim = claims.find((row) => row?.id === a.execution.id)!;
    const bClaim = claims.find((row) => row?.id === b.execution.id)!;
    await states.update(aClaim, {
      status: 'running',
      publicText: 'Answer A',
      sourceWatermark: 'shared-source-id',
      projectionRevision: 1,
    });
    await states.update(bClaim, {
      status: 'running',
      publicText: 'Answer B',
      sourceWatermark: 'shared-source-id',
      projectionRevision: 1,
    });
    const bBefore = await execution(b.execution.id);
    await commands.stop(f.principal, a.execution.id);
    expect(await execution(b.execution.id)).toEqual(bBefore);
    expect(
      (await commands.listMessages(f.principal, f.conversation.id)).map((row) => row.content),
    ).toEqual(['Hello', 'Answer A']);
    expect((await commands.listMessages(f.principal, second.id)).map((row) => row.content)).toEqual(
      ['Hello', 'Answer B'],
    );
  });
});
