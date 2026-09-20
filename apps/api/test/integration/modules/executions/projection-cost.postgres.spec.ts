import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { API_MIGRATIONS_TABLE } from '@api/database/database-options';
import { databaseMigrations } from '@api/database/migrations';
import { databaseEntities } from '@api/database/typeorm.options';
import { ConversationsService } from '@api/modules/conversations/application/conversations.service';
import { ConversationEntity } from '@api/modules/conversations/infrastructure/persistence/conversation.entity';
import { ExecutionProcessor } from '@api/modules/executions/application/execution-processor';
import { ExecutionStreamConsumer } from '@api/modules/executions/application/execution-stream.consumer';
import { ExecutionsService } from '@api/modules/executions/application/executions.service';
import type {
  RuntimeClient,
  RuntimeRun,
} from '@api/modules/executions/application/runtime-client.port';
import { ExecutionLeaseStore } from '@api/modules/executions/infrastructure/persistence/execution-lease.store';
import { ExecutionStateStore } from '@api/modules/executions/infrastructure/persistence/execution-state.store';
import { ExecutionEntity } from '@api/modules/executions/infrastructure/persistence/execution.entity';
import { MessageEntity } from '@api/modules/executions/infrastructure/persistence/message.entity';
import { ProjectEntity } from '@api/modules/projects/infrastructure/persistence/project.entity';
import { TenantEntity } from '@api/modules/tenants/tenant.entity';
import { TenantsService } from '@api/modules/tenants/tenants.service';
import { UserEntity } from '@api/modules/users/user.entity';

/**
 * Opt-in cost probe for streamed projection: ALFRED_PROJECTION_BENCH=1 with a disposable database.
 * It reports database time per token, durable commits and WAL bytes per byte of visible text, and
 * fails if the commit count ever approaches one per token again.
 */
const url = process.env.TEST_DATABASE_URL;
const enabled =
  url && process.env.TEST_MIGRATION_DATABASE_URL && process.env.ALFRED_PROJECTION_BENCH === '1';
const bench = enabled ? describe : describe.skip;
const TOKENS = Number(process.env.ALFRED_PROJECTION_BENCH_TOKENS ?? '1500');
const TOKEN = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tem ';

bench('streamed projection cost', () => {
  let db: DataSource;
  let commands: ExecutionsService;
  let leases: ExecutionLeaseStore;
  let states: ExecutionStateStore;

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
    const tenants = new TenantsService(db);
    commands = new ExecutionsService(db, tenants, new ConversationsService(db, tenants));
    leases = new ExecutionLeaseStore(db);
    states = new ExecutionStateStore(db);
  });
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  it(`projects ${TOKENS} tokens with bounded commits and reports the cost`, async () => {
    const tenantId = (await db.getRepository(TenantEntity).findOneByOrFail({ slug: 'default' })).id;
    const userId = randomUUID();
    await db
      .getRepository(UserEntity)
      .insert({ id: userId, tenantId, email: `${userId}@example.test`, displayName: 'Bench' });
    const project = await db
      .getRepository(ProjectEntity)
      .save({ tenantId, ownerUserId: userId, kind: 'named', name: 'Bench' });
    const conversation = await db
      .getRepository(ConversationEntity)
      .save({ projectId: project.id, title: 'Bench', titleSource: 'user' });
    const principal = {
      id: userId,
      email: `${userId}@example.test`,
      sessionId: randomUUID(),
      role: 'user' as const,
    };
    const started = await commands.start(principal, conversation.id, 'Hello', {
      submissionId: randomUUID(),
      profile: 'durable-v1',
    });
    const run: RuntimeRun = {
      executionId: started.execution.id,
      invocationId: started.execution.invocationId,
      threadId: started.execution.runtimeThreadId!,
      runId: randomUUID(),
      status: 'running',
      stopRequested: false,
      replayAvailable: true,
    };
    let status: RuntimeRun['status'] = 'running';
    const join = vi.fn(async function* (
      _id: string,
      _invocation: string,
      options: { after: string | null },
    ) {
      await Promise.resolve();
      const from = options.after === null ? 0 : Number(options.after) + 1;
      for (let index = from; index < TOKENS; index += 1) {
        yield {
          id: String(index),
          event: 'messages-tuple',
          data: [{ id: 'answer', type: 'AIMessageChunk', content: TOKEN }, {}],
        };
      }
      status = 'success';
    });
    const runtime = {
      dispatch: vi.fn(() => Promise.resolve(run)),
      inspect: vi.fn(() => Promise.resolve({ ...run, status })),
      cancel: vi.fn(() => Promise.resolve(run)),
      join,
      generateTitle: vi.fn(() => Promise.resolve(null)),
    } as unknown as RuntimeClient;
    const config = { get: vi.fn() } as unknown as ConfigService;
    const commits = vi.spyOn(states, 'updateProjection');
    const full = vi.spyOn(states, 'update');
    const [{ lsn: before }] = await db.query<[{ lsn: string }]>(
      'SELECT pg_current_wal_lsn()::text AS lsn',
    );
    const claimed = (await leases.claim('bench', 30_000))!;
    const startedAt = performance.now();
    await new ExecutionProcessor(
      states,
      leases,
      runtime,
      config,
      new ExecutionStreamConsumer(states, runtime, config),
    ).process(claimed);
    const elapsedMs = performance.now() - startedAt;
    const [{ bytes }] = await db.query<[{ bytes: string }]>(
      'SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), $1::pg_lsn)::bigint AS bytes',
      [before],
    );
    const persisted = await db
      .getRepository(ExecutionEntity)
      .findOneByOrFail({ id: started.execution.id });
    const textBytes = Buffer.byteLength(persisted.publicText, 'utf8');
    const report = {
      tokens: TOKENS,
      textBytes,
      elapsedMs: Math.round(elapsedMs),
      msPerToken: Number((elapsedMs / TOKENS).toFixed(3)),
      progressCommits: commits.mock.calls.length,
      fullCommits: full.mock.calls.length,
      walBytes: Number(bytes),
      walAmplification: Number((Number(bytes) / textBytes).toFixed(2)),
    };
    process.stdout.write(`PROJECTION_COST ${JSON.stringify(report)}\n`);
    expect(persisted.status).toBe('completed');
    expect(persisted.publicText).toBe(TOKEN.repeat(TOKENS));
    expect(
      (
        await db
          .getRepository(MessageEntity)
          .findBy({ executionId: persisted.id, role: 'assistant' })
      ).map((row) => row.content),
    ).toEqual([TOKEN.repeat(TOKENS)]);
    // Progress commits follow the 4 KB window, never the token count.
    expect(report.progressCommits).toBeLessThan(TOKENS / 10);
    expect(report.walAmplification).toBeLessThan(8);
  }, 120_000);
});
