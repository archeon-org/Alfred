import { createHash, randomUUID } from 'node:crypto';
import type { Conversation, Message } from '@alfred/contracts';
import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, In, IsNull, type EntityManager } from 'typeorm';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { ApiException } from '../../../common/errors/api.exception';
import { ConversationsService } from '../../conversations/application/conversations.service';
import { toConversationDto } from '../../conversations/domain/conversation';
import { ConversationEntity } from '../../conversations/infrastructure/persistence/conversation.entity';
import { ProjectEntity } from '../../projects/infrastructure/persistence/project.entity';
import { TenantEntity } from '../../tenants/tenant.entity';
import { TenantsService } from '../../tenants/tenants.service';
import { autoTitle, toMessageDto } from '../domain/execution';
import {
  ACTIVE_EXECUTION_STATUSES,
  EXECUTION_DEADLINE_MS,
  isExecutionBusy,
} from '../domain/execution-lifecycle';
import { ExecutionEntity } from '../infrastructure/persistence/execution.entity';
import { MessageEntity } from '../infrastructure/persistence/message.entity';
import { RuntimeThreadEntity } from '../infrastructure/persistence/runtime-thread.entity';

export interface StartedExecution {
  readonly execution: ExecutionEntity;
  readonly message: string;
  readonly conversation: Conversation;
  readonly titleRequested: boolean;
}
export interface SubmissionIdentity {
  readonly submissionId: string;
  readonly profile: string;
}

@Injectable()
export class ExecutionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenants: TenantsService,
    private readonly conversations: ConversationsService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  async listMessages(principal: AuthPrincipal, conversationId: string): Promise<Message[]> {
    await this.conversations.get(principal, conversationId);
    const rows = await this.dataSource.getRepository(MessageEntity).find({
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 500,
      where: { conversationId },
    });
    return rows.reverse().map(toMessageDto);
  }

  /** Intent, submission identity, user turn and binding commit before external dispatch. */
  async start(
    principal: AuthPrincipal,
    conversationId: string,
    message: string,
    identity: SubmissionIdentity,
  ): Promise<StartedExecution> {
    const scope = await this.tenants.scopeFor(principal.id);
    const submissionHash = createHash('sha256')
      .update(
        JSON.stringify({
          owner: scope.ownerUserId,
          tenant: scope.tenantId,
          conversationId,
          message,
          profile: identity.profile,
        }),
      )
      .digest('hex');
    return this.dataSource.transaction(async (manager) => {
      const { conversation, project } = await this.conversations.lockOwned(
        manager,
        scope,
        conversationId,
      );
      const executions = manager.getRepository(ExecutionEntity);
      const existing = await executions.findOne({
        where: { conversationId, submissionId: identity.submissionId },
      });
      if (existing !== null) {
        if (existing.submissionHash !== submissionHash || existing.ownerUserId !== principal.id) {
          throw new ApiException(
            409,
            'idempotency_conflict',
            'The submission identity was already used for another request.',
          );
        }
        return {
          conversation: toConversationDto(conversation, project.kind),
          execution: existing,
          message,
          titleRequested: existing.titleRequested,
        };
      }
      if (conversation.archivedAt !== null)
        throw new ApiException(409, 'conversation_archived', 'Conversation is archived.');
      // Only work that is genuinely advancing keeps the thread. A parked or stalled answer is
      // superseded by this message (ALF-DEC-033 §4/§6); the replacement dispatch interrupts any
      // lingering native run on the thread before the new one starts.
      const now = new Date();
      const unsettled = await executions.find({
        where: {
          conversationId,
          status: In([...ACTIVE_EXECUTION_STATUSES]),
          finishedAt: IsNull(),
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (unsettled.some((row) => isExecutionBusy(row, now))) {
        throw new ApiException(409, 'thread_busy', 'The conversation is already answering.');
      }
      for (const stale of unsettled) {
        await executions.update(
          { id: stale.id },
          {
            status: 'cancelled',
            error: 'superseded',
            finishedAt: now,
            stopRequestedAt: stale.stopRequestedAt ?? now,
          },
        );
      }
      await this.checkAdmission(manager, principal.id);
      const threads = manager.getRepository(RuntimeThreadEntity);
      const binding =
        (await threads.findOne({ where: { conversationId } })) ??
        (await threads.save(
          threads.create({
            conversationId,
            runtime: 'langgraph',
            threadId: randomUUID(),
            generation: randomUUID(),
          }),
        ));
      const titleRequested = conversation.titleSource === 'none';
      const deadlineMs = this.config?.get<number>('EXECUTION_DEADLINE_MS') ?? EXECUTION_DEADLINE_MS;
      const execution = await executions.save(
        executions.create({
          ...scope,
          projectId: project.id,
          conversationId,
          createdAt: now,
          startedAt: null,
          finishedAt: null,
          submissionId: identity.submissionId,
          submissionHash,
          responseProfile: identity.profile,
          invocationId: randomUUID(),
          bindingGeneration: binding.generation,
          runtimeThreadId: binding.threadId,
          runtimeRunId: null,
          status: 'pending',
          dispatchState: 'pending',
          error: null,
          stopRequestedAt: null,
          deadlineAt: new Date(now.getTime() + deadlineMs),
          nextAttemptAt: now,
          leaseOwner: null,
          leaseVersion: 0,
          leaseExpiresAt: null,
          sourceWatermark: null,
          projectionRevision: 0,
          reducerState: {},
          publicText: '',
          titleRequested,
        }),
      );
      const messages = manager.getRepository(MessageEntity);
      await messages.save(
        messages.create({
          content: message,
          conversationId,
          executionId: execution.id,
          role: 'user',
        }),
      );
      const changes = {
        lastActivityAt: now,
        ...(titleRequested ? { title: autoTitle(message), titleSource: 'auto' as const } : {}),
      };
      await manager.getRepository(ConversationEntity).update({ id: conversationId }, changes);
      return {
        conversation: toConversationDto({ ...conversation, ...changes }, project.kind),
        execution,
        message,
        titleRequested,
      };
    });
  }

  async getObservation(principal: AuthPrincipal, id: string): Promise<ExecutionEntity> {
    const scope = await this.tenants.scopeFor(principal.id);
    const row = await this.dataSource
      .getRepository(ExecutionEntity)
      .findOne({ where: { id, ...scope } });
    if (row === null) throw new ApiException(404, 'execution_not_found', 'Execution not found.');
    await this.conversations.get(principal, row.conversationId);
    if (row.responseProfile !== 'legacy') {
      const binding = await this.dataSource.getRepository(RuntimeThreadEntity).findOne({
        where: {
          conversationId: row.conversationId,
          generation: row.bindingGeneration,
          threadId: row.runtimeThreadId ?? '',
        },
      });
      if (binding === null)
        throw new ApiException(
          409,
          'execution_binding_changed',
          'Execution binding is no longer active.',
        );
    }
    return row;
  }

  async active(principal: AuthPrincipal, conversationId: string): Promise<ExecutionEntity | null> {
    await this.conversations.get(principal, conversationId);
    const scope = await this.tenants.scopeFor(principal.id);
    return this.dataSource.getRepository(ExecutionEntity).findOne({
      where: {
        conversationId,
        ...scope,
        status: In([...ACTIVE_EXECUTION_STATUSES]),
        finishedAt: IsNull(),
      },
    });
  }

  /** This persists intent only. Runtime cancellation acknowledgment is reconciled by the worker. */
  async stop(principal: AuthPrincipal, id: string): Promise<ExecutionEntity> {
    const located = await this.getObservation(principal, id);
    const scope = await this.tenants.scopeFor(principal.id);
    return this.dataSource.transaction(async (manager) => {
      await this.conversations.lockOwned(manager, scope, located.conversationId);
      const repository = manager.getRepository(ExecutionEntity);
      const row = await repository.findOneOrFail({
        where: { id, ...scope },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !(ACTIVE_EXECUTION_STATUSES as readonly string[]).includes(row.status) ||
        row.stopRequestedAt !== null
      )
        return row;
      // Legacy executions have no receiver invocation identity and cannot be dispatched safely.
      const status = row.responseProfile === 'legacy' ? 'recovery_required' : 'stopping';
      const next = {
        ...row,
        stopRequestedAt: new Date(),
        nextAttemptAt: new Date(),
        status,
      } as ExecutionEntity;
      return repository.save(next);
    });
  }

  private async checkAdmission(manager: EntityManager, ownerUserId: string): Promise<void> {
    // Serialize quota admission across replicas; the business transaction releases the lock.
    await manager.query("SELECT pg_advisory_xact_lock(hashtext('alfred.execution.admission'))");
    const counts: { total: string; owned: string }[] = await manager.query(
      `SELECT count(*) AS total, count(*) FILTER (WHERE "owner_user_id" = $1) AS owned
       FROM "api_executions" WHERE "status" = ANY($2::varchar[]) AND "finished_at" IS NULL`,
      [ownerUserId, ACTIVE_EXECUTION_STATUSES],
    );
    const count = counts[0];
    const maxUser = this.config?.get<number>('EXECUTION_MAX_ACTIVE_PER_USER') ?? 4;
    const maxGlobal = this.config?.get<number>('EXECUTION_MAX_ACTIVE_GLOBAL') ?? 64;
    if (count === undefined || Number(count.total) >= maxGlobal || Number(count.owned) >= maxUser) {
      throw new ApiException(
        429,
        'execution_capacity',
        'The active execution limit has been reached.',
      );
    }
  }

  /** Resolve native coordinates and input inside the backend under current Product authority. */
  async resolveRuntime(id: string, invocationId: string) {
    const execution = await this.dataSource
      .getRepository(ExecutionEntity)
      .findOne({ where: { id, invocationId } });
    if (execution === null)
      throw new ApiException(404, 'execution_not_found', 'Execution not found.');
    const scope = await this.tenants.scopeFor(execution.ownerUserId);
    const tenant = await this.dataSource
      .getRepository(TenantEntity)
      .findOneBy({ id: execution.tenantId, status: 'active' });
    if (tenant === null || scope.tenantId !== execution.tenantId)
      throw new ApiException(403, 'execution_authority_lost', 'Execution access is unavailable.');
    const project = await this.dataSource.getRepository(ProjectEntity).findOne({
      where: {
        id: execution.projectId,
        ...scope,
        status: 'active',
      },
    });
    const conversation = await this.dataSource.getRepository(ConversationEntity).findOne({
      where: {
        id: execution.conversationId,
        projectId: execution.projectId,
      },
    });
    const binding = await this.dataSource.getRepository(RuntimeThreadEntity).findOne({
      where: {
        conversationId: execution.conversationId,
        generation: execution.bindingGeneration,
        threadId: execution.runtimeThreadId ?? '',
      },
    });
    if (
      project === null ||
      conversation === null ||
      conversation.archivedAt !== null ||
      binding === null
    ) {
      throw new ApiException(403, 'execution_authority_lost', 'Execution access is unavailable.');
    }
    const userMessage = await this.dataSource
      .getRepository(MessageEntity)
      .findOne({ where: { executionId: id, role: 'user' } });
    if (userMessage === null)
      throw new ApiException(409, 'execution_input_missing', 'Execution input is unavailable.');
    return { execution, userMessage: userMessage.content, conversation, project };
  }
}
