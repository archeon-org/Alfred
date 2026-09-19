import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager, Not } from 'typeorm';
import type { ExecutionFence } from '../../domain/execution-lifecycle';
import { ACTIVE_EXECUTION_STATUSES } from '../../domain/execution-lifecycle';
import { FENCE_SQL, fenceValues } from './execution-lease.store';
import { ConversationEntity } from '../../../conversations/infrastructure/persistence/conversation.entity';
import { ProjectEntity } from '../../../projects/infrastructure/persistence/project.entity';
import { RuntimeThreadEntity } from './runtime-thread.entity';
import { ExecutionEntity } from './execution.entity';
import { MessageEntity } from './message.entity';
import { UserEntity } from '../../../users/user.entity';
import { TenantEntity } from '../../../tenants/tenant.entity';

export class ExecutionFenceLost extends Error {
  constructor() {
    super('Execution lease or authority is no longer valid.');
  }
}
/** Progress-only fields: text and reducer state under the lease fence, no parent authority locks. */
export type ExecutionProgress = Pick<
  ExecutionEntity,
  'reducerState' | 'publicText' | 'sourceWatermark' | 'projectionRevision'
>;

export type ExecutionChanges = Partial<
  Pick<
    ExecutionEntity,
    | 'status'
    | 'error'
    | 'dispatchState'
    | 'runtimeRunId'
    | 'startedAt'
    | 'finishedAt'
    | 'stopRequestedAt'
    | 'reducerState'
    | 'sourceWatermark'
    | 'projectionRevision'
    | 'publicText'
    | 'titleRequested'
  >
>;

@Injectable()
export class ExecutionStateStore {
  constructor(private readonly dataSource: DataSource) {}

  async load(id: string): Promise<ExecutionEntity | null> {
    return this.dataSource.getRepository(ExecutionEntity).findOneBy({ id });
  }

  /**
   * Progress commit for streamed output: one fenced row update, no parent locks, no transcript
   * row. Parent authority is re-verified by the worker every few seconds and on the terminal
   * commit; the lease fence and active status still gate every write. Returns false when the fence
   * no longer matches.
   */
  async updateProjection(
    fence: ExecutionFence,
    changes: Required<
      Pick<
        ExecutionChanges,
        'reducerState' | 'publicText' | 'sourceWatermark' | 'projectionRevision'
      >
    >,
    conversationId?: string,
  ): Promise<boolean> {
    const rows: unknown[] = await this.dataSource.query(
      `WITH committed AS (UPDATE "api_executions"
        SET "reducer_state" = $6::jsonb, "public_text" = $7, "source_watermark" = $8,
          "projection_revision" = $9, "updated_at" = clock_timestamp()
        WHERE ${FENCE_SQL} AND "status" = ANY($10::varchar[]) RETURNING "id")
       SELECT "id" FROM committed`,
      [
        ...fenceValues(fence),
        JSON.stringify(changes.reducerState),
        changes.publicText,
        changes.sourceWatermark,
        changes.projectionRevision,
        ACTIVE_EXECUTION_STATUSES,
      ],
    );
    if (rows.length !== 1) return false;
    if (conversationId !== undefined) {
      await this.dataSource
        .getRepository(ConversationEntity)
        .update({ id: conversationId }, { lastActivityAt: new Date() });
    }
    return true;
  }

  /** Lock-free view of the same authority the locked update enforces; used between commits. */
  async authorityHolds(fence: ExecutionFence): Promise<boolean> {
    const located = await this.dataSource.getRepository(ExecutionEntity).findOneBy({
      id: fence.id,
      invocationId: fence.invocationId,
    });
    if (located === null) return false;
    return this.resourcesActive(this.dataSource.manager, located, fence, false);
  }

  /** Locks parent first; every side effect shares the execution fence and immutable ceiling. */
  async update(
    fence: ExecutionFence,
    changes: ExecutionChanges,
    title?: string,
  ): Promise<ExecutionEntity> {
    return this.dataSource.transaction(async (manager) => {
      const row = await this.lock(manager, fence);
      const next = { ...row, ...changes };
      // Stop can arrive while a worker streams. Never erase a newly persisted Stop intent.
      if (
        row.stopRequestedAt !== null &&
        (changes.status === 'running' || changes.status === 'recovering')
      )
        next.status = 'stopping';
      if (changes.publicText !== undefined && changes.publicText.length > 0) {
        await manager.query(
          `INSERT INTO "api_messages" ("conversation_id", "execution_id", "role", "content")
          VALUES ($1, $2, 'assistant', $3) ON CONFLICT ("execution_id", "role") WHERE "execution_id" IS NOT NULL
          DO UPDATE SET "content" = EXCLUDED."content"`,
          [row.conversationId, row.id, changes.publicText],
        );
      }
      if (changes.publicText === '') {
        await manager
          .getRepository(MessageEntity)
          .delete({ executionId: row.id, role: 'assistant' });
      }
      if (title !== undefined) {
        await manager
          .getRepository(ConversationEntity)
          .update(
            { id: row.conversationId, titleSource: Not('user') },
            { title, titleSource: 'auto' },
          );
      }
      if (changes.publicText !== undefined || changes.finishedAt !== undefined) {
        await manager
          .getRepository(ConversationEntity)
          .update({ id: row.conversationId }, { lastActivityAt: new Date() });
      }
      return manager.getRepository(ExecutionEntity).save(next);
    });
  }

  /**
   * Intermediate projection commit: one row, one lock, fenced by lease, invocation, generation and
   * active status. Parent authority is verified by the worker's periodic check and by every semantic
   * or terminal commit through `update`, not on every token. Returns false when the fence is gone.
   */
  async commitProgress(fence: ExecutionFence, progress: ExecutionProgress): Promise<boolean> {
    const rows: unknown[] = await this.dataSource.query(
      `WITH committed AS (UPDATE "api_executions"
        SET "reducer_state" = $6::jsonb, "public_text" = $7, "source_watermark" = $8,
          "projection_revision" = $9, "updated_at" = clock_timestamp()
        WHERE ${FENCE_SQL} AND "status" = ANY($10::varchar[]) RETURNING "id")
       SELECT "id" FROM committed`,
      [
        ...fenceValues(fence),
        JSON.stringify(progress.reducerState),
        progress.publicText,
        progress.sourceWatermark,
        progress.projectionRevision,
        ACTIVE_EXECUTION_STATUSES,
      ],
    );
    return rows.length === 1;
  }

  /**
   * Lock-free authority check for the worker's periodic verification (ALF-DEC-038 current
   * authorization): owner and tenant active, project active, conversation present and not archived,
   * binding generation still current. False means the fence can no longer be honoured.
   */
  async verifyAuthority(row: ExecutionEntity): Promise<boolean> {
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM "api_executions" e
         JOIN "api_tenants" t ON t."id" = e."tenant_id" AND t."status" = 'active'
         JOIN "api_users" u ON u."id" = e."owner_user_id" AND u."tenant_id" = e."tenant_id" AND u."status" = 'active'
         JOIN "api_projects" p ON p."id" = e."project_id" AND p."owner_user_id" = e."owner_user_id"
           AND p."tenant_id" = e."tenant_id" AND p."status" = 'active'
         JOIN "api_conversations" c ON c."id" = e."conversation_id" AND c."project_id" = e."project_id"
           AND c."archived_at" IS NULL
         JOIN "api_runtime_threads" b ON b."conversation_id" = e."conversation_id"
           AND b."generation" = e."binding_generation"
       WHERE e."id" = $1 AND e."invocation_id" = $2 LIMIT 1`,
      [row.id, row.invocationId],
    );
    return rows.length === 1;
  }

  /**
   * Terminal write under the lease fence only. Used when the resource authority behind the fence is
   * gone (owner disabled, project or conversation archived, binding replaced): the ordinary update
   * can no longer be applied, yet the row must stop reserving its conversation and its worker slot.
   */
  async abandon(fence: ExecutionFence, error: string): Promise<boolean> {
    const rows: unknown[] = await this.dataSource.query(
      `WITH abandoned AS (UPDATE "api_executions"
        SET "status" = 'cancelled', "error" = $6, "finished_at" = clock_timestamp(),
          "stop_requested_at" = COALESCE("stop_requested_at", clock_timestamp())
        WHERE ${FENCE_SQL} AND "status" = ANY($7::varchar[]) RETURNING "id")
       SELECT "id" FROM abandoned`,
      [...fenceValues(fence), error, ACTIVE_EXECUTION_STATUSES],
    );
    return rows.length === 1;
  }

  /**
   * A generated title belongs to the conversation, not to the execution fence: it may arrive after
   * the execution finished. A user rename is never overwritten.
   */
  async applyTitle(
    row: Pick<ExecutionEntity, 'id' | 'invocationId' | 'conversationId'>,
    title: string | null,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      if (title !== null) {
        await manager
          .getRepository(ConversationEntity)
          .update(
            { id: row.conversationId, titleSource: Not('user') },
            { title, titleSource: 'auto' },
          );
      }
      await manager
        .getRepository(ExecutionEntity)
        .update({ id: row.id, invocationId: row.invocationId }, { titleRequested: false });
    });
  }

  private async lock(manager: EntityManager, fence: ExecutionFence): Promise<ExecutionEntity> {
    const executions = manager.getRepository(ExecutionEntity);
    const located = await executions.findOneBy({ id: fence.id });
    if (located === null) throw new ExecutionFenceLost();
    if (!(await this.resourcesActive(manager, located, fence, true)))
      throw new ExecutionFenceLost();
    const row = await executions
      .createQueryBuilder('execution')
      .setLock('pessimistic_write')
      .where(
        'execution.id = :id AND execution.invocationId = :invocationId AND execution.bindingGeneration = :bindingGeneration',
        fence,
      )
      .andWhere(
        'execution.leaseOwner = :leaseOwner AND execution.leaseVersion = :leaseVersion',
        fence,
      )
      .andWhere('execution.leaseExpiresAt > clock_timestamp()')
      .andWhere('execution.status IN (:...statuses)', { statuses: ACTIVE_EXECUTION_STATUSES })
      .getOne();
    if (row === null) throw new ExecutionFenceLost();
    return row;
  }

  /** Tenant, owner, project, conversation and binding must all still be active for this fence. */
  private async resourcesActive(
    manager: EntityManager,
    located: ExecutionEntity,
    fence: ExecutionFence,
    lock: boolean,
  ): Promise<boolean> {
    const read = lock ? { lock: { mode: 'pessimistic_read' as const } } : {};
    const write = lock ? { lock: { mode: 'pessimistic_write' as const } } : {};
    const tenant = await manager.getRepository(TenantEntity).findOne({
      where: { id: located.tenantId, status: 'active' },
      ...read,
    });
    const user = await manager.getRepository(UserEntity).findOne({
      where: { id: located.ownerUserId, tenantId: located.tenantId, status: 'active' },
      ...read,
    });
    if (tenant === null || user === null) return false;
    const project = await manager.getRepository(ProjectEntity).findOne({
      where: {
        id: located.projectId,
        ownerUserId: located.ownerUserId,
        tenantId: located.tenantId,
        status: 'active',
      },
      ...write,
    });
    const conversation = await manager.getRepository(ConversationEntity).findOne({
      where: { id: located.conversationId, projectId: located.projectId },
      ...write,
    });
    const binding = await manager.getRepository(RuntimeThreadEntity).findOne({
      where: { conversationId: located.conversationId, generation: fence.bindingGeneration },
      ...read,
    });
    return (
      project !== null &&
      conversation !== null &&
      conversation.archivedAt === null &&
      binding !== null
    );
  }
}
