import {
  CONVERSATION_SSE_EVENT,
  createAssistantReply,
  EXECUTION_SSE_EVENT,
  type Conversation,
  type ExecutionStatus,
  type ExecutionStreamEvent,
  type Message,
} from '@alfred/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, In, LessThan, Not } from 'typeorm';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { ApiException } from '../../../common/errors/api.exception';
import { ConversationsService } from '../../conversations/application/conversations.service';
import { toConversationDto } from '../../conversations/domain/conversation';
import { ConversationEntity } from '../../conversations/infrastructure/persistence/conversation.entity';
import { TenantsService } from '../../tenants/tenants.service';
import {
  ABANDONED_EXECUTION_ERROR,
  autoTitle,
  describeRuntimeError,
  EXECUTION_ABANDON_AFTER_MS,
  sanitizeGeneratedTitle,
  toExecutionDto,
  toMessageDto,
} from '../domain/execution';
import { ExecutionEntity } from '../infrastructure/persistence/execution.entity';
import { MessageEntity } from '../infrastructure/persistence/message.entity';
import { RuntimeThreadEntity } from '../infrastructure/persistence/runtime-thread.entity';
import { RUNTIME_CLIENT, type RuntimeClient } from './runtime-client.port';

export interface StartedExecution {
  readonly execution: ExecutionEntity;
  readonly message: string;
  /** Public view after the provisional title and activity update. */
  readonly conversation: Conversation;
  /** True for the first message of an untitled chat: the runtime title graph is consulted. */
  readonly titleRequested: boolean;
}

const MESSAGE_LIST_LIMIT = 500;
const ACTIVE_STATUSES: readonly ExecutionStatus[] = ['pending', 'running'];
const STORE_FAILURE = 'The answer could not be stored.';

type TerminalChanges = Pick<ExecutionEntity, 'error' | 'finishedAt' | 'runtimeRunId' | 'status'>;

@Injectable()
export class ExecutionsService {
  private readonly logger = new Logger(ExecutionsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenants: TenantsService,
    private readonly conversations: ConversationsService,
    @Inject(RUNTIME_CLIENT) private readonly runtime: RuntimeClient,
  ) {}

  /** The most recent turns of the product store, returned oldest first (ALF-DEC-007). */
  async listMessages(principal: AuthPrincipal, conversationId: string): Promise<Message[]> {
    await this.conversations.get(principal, conversationId);
    const rows = await this.dataSource.getRepository(MessageEntity).find({
      order: { createdAt: 'DESC', id: 'DESC' },
      take: MESSAGE_LIST_LIMIT,
      where: { conversationId },
    });
    return rows.reverse().map(toMessageDto);
  }

  /**
   * Authorizes the request and records the execution and the user turn before anything reaches
   * the runtime (ALF-DEC-004/033). Throws ordinary API errors, so the caller can still answer JSON.
   */
  async start(
    principal: AuthPrincipal,
    conversationId: string,
    message: string,
  ): Promise<StartedExecution> {
    const scope = await this.tenants.scopeFor(principal.id);
    return this.dataSource.transaction(async (manager) => {
      const { conversation, project } = await this.conversations.lockOwned(
        manager,
        scope,
        conversationId,
      );
      if (conversation.archivedAt !== null) {
        throw new ApiException(409, 'conversation_archived', 'Conversation is archived.');
      }
      const executions = manager.getRepository(ExecutionEntity);
      // An execution left active by a dead process is closed here instead of blocking the chat.
      await executions.update(
        {
          conversationId,
          createdAt: LessThan(new Date(Date.now() - EXECUTION_ABANDON_AFTER_MS)),
          status: In([...ACTIVE_STATUSES]),
        },
        { error: ABANDONED_EXECUTION_ERROR, finishedAt: new Date(), status: 'failed' },
      );
      const active = await executions.exists({
        where: { conversationId, status: In([...ACTIVE_STATUSES]) },
      });
      if (active) {
        throw new ApiException(409, 'thread_busy', 'The conversation is already answering.');
      }
      const execution = await executions.save(
        executions.create({
          conversationId,
          error: null,
          finishedAt: null,
          runtimeRunId: null,
          runtimeThreadId: null,
          startedAt: null,
          status: 'pending',
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
      // The first message names an untitled chat provisionally; the title graph refines it later.
      const titleRequested = conversation.titleSource === 'none';
      const changes = {
        lastActivityAt: new Date(),
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

  /**
   * Dispatches the execution to the runtime, relays its native events unchanged and stores the
   * assistant turn at the end. The conversation view is pushed first (provisional title) and again
   * when the title graph answers; the terminal `execution` event goes out before that answer, so
   * nobody waits for the title. Never throws: failures end as a `failed` execution event.
   */
  async *stream(
    started: StartedExecution,
    signal: AbortSignal,
  ): AsyncGenerator<ExecutionStreamEvent> {
    const { execution, message } = started;
    const reply = createAssistantReply();
    const pendingTitle: { event: ExecutionStreamEvent | null } = { event: null };
    const titleTask = started.titleRequested
      ? this.generateTitle(started, signal).then((event) => {
          pendingTitle.event = event;
        })
      : Promise.resolve();
    let threadId: string | null = null;
    let runId: string | null = null;
    let failure: string | null = null;
    yield conversationEvent(started.conversation);
    try {
      threadId = await this.ensureThread(execution.conversationId);
      await this.update(execution, {
        runtimeThreadId: threadId,
        startedAt: new Date(),
        status: 'running',
      });
      yield executionEvent(execution);
      const input = { messages: [{ content: message, role: 'user' }] };
      const events = this.runtime.stream(threadId, input, {
        onRunCreated: (id) => {
          runId = id;
        },
        signal,
      });
      for await (const event of events) {
        reply.observe(event.event, event.data);
        if (event.event === 'error') failure = describeRuntimeError(errorOf(event.data));
        yield event;
        if (pendingTitle.event !== null) {
          yield pendingTitle.event;
          pendingTitle.event = null;
        }
      }
    } catch (error) {
      if (!signal.aborted) {
        failure = describeRuntimeError(error);
        this.logger.warn(`Execution ${execution.id} failed: ${failure}`);
      }
    }
    if (signal.aborted) await this.cancelRun(execution, threadId, runId);
    await this.finish(
      execution,
      runId,
      signal.aborted ? null : failure,
      reply.text,
      signal.aborted,
    );
    yield executionEvent(execution);
    await titleTask;
    if (pendingTitle.event !== null) yield pendingTitle.event;
  }

  /** One active runtime thread per conversation, created on first use (ALF-DEC-032). */
  private async ensureThread(conversationId: string): Promise<string> {
    const threads = this.dataSource.getRepository(RuntimeThreadEntity);
    const existing = await threads.findOne({ where: { conversationId } });
    if (existing !== null) return existing.threadId;
    const { threadId } = await this.runtime.createThread({ conversationId });
    await threads.save(threads.create({ conversationId, runtime: 'langgraph', threadId }));
    return threadId;
  }

  /**
   * Asks the title graph and stores its answer unless the user renamed the chat meanwhile. Any
   * failure keeps the provisional title; the chat itself is never affected.
   */
  private async generateTitle(
    started: StartedExecution,
    signal: AbortSignal,
  ): Promise<ExecutionStreamEvent | null> {
    const { conversation, message } = started;
    try {
      const generated = await this.runtime.generateTitle(message, { signal });
      const title = generated === null ? null : sanitizeGeneratedTitle(generated);
      if (title === null) return null;
      const result = await this.dataSource
        .getRepository(ConversationEntity)
        .update({ id: conversation.id, titleSource: Not('user') }, { title, titleSource: 'auto' });
      if ((result.affected ?? 0) === 0) return null;
      return conversationEvent({ ...conversation, title, titleSource: 'auto' });
    } catch (error) {
      if (!signal.aborted) {
        this.logger.warn(
          `Title generation skipped for conversation ${conversation.id}: ${describeRuntimeError(error)}`,
        );
      }
      return null;
    }
  }

  /** Stopping is a product action: the runtime run is cancelled, not merely disconnected. */
  private async cancelRun(
    execution: ExecutionEntity,
    threadId: string | null,
    runId: string | null,
  ): Promise<void> {
    if (threadId === null || runId === null) return;
    try {
      await this.runtime.cancel(threadId, runId);
    } catch (error) {
      this.logger.warn(
        `Run ${runId} of execution ${execution.id} could not be cancelled: ${describeRuntimeError(error)}`,
      );
    }
  }

  /**
   * Stores the assistant turn and the terminal state in one transaction; called exactly once per
   * execution. When the store fails nothing is written: the row stays active until the abandon
   * guard in `start` closes it, and the client still receives a terminal `failed` state.
   */
  private async finish(
    execution: ExecutionEntity,
    runId: string | null,
    error: string | null,
    replyText: string,
    aborted: boolean,
  ): Promise<void> {
    const status: ExecutionStatus = error !== null ? 'failed' : aborted ? 'cancelled' : 'completed';
    const changes: TerminalChanges = { error, finishedAt: new Date(), runtimeRunId: runId, status };
    try {
      await this.dataSource.transaction(async (manager) => {
        if (replyText.length > 0) {
          const messages = manager.getRepository(MessageEntity);
          await messages.save(
            messages.create({
              content: replyText,
              conversationId: execution.conversationId,
              executionId: execution.id,
              role: 'assistant',
            }),
          );
        }
        await manager
          .getRepository(ConversationEntity)
          .update({ id: execution.conversationId }, { lastActivityAt: new Date() });
        await manager.getRepository(ExecutionEntity).update({ id: execution.id }, changes);
      });
      Object.assign(execution, changes);
    } catch (storeError) {
      this.logger.error(
        `Execution ${execution.id} could not be finished: ${describeRuntimeError(storeError)}`,
      );
      Object.assign(execution, { ...changes, error: STORE_FAILURE, status: 'failed' });
    }
  }

  private async update(
    execution: ExecutionEntity,
    changes: Partial<Pick<ExecutionEntity, 'runtimeThreadId' | 'startedAt' | 'status'>>,
  ): Promise<void> {
    await this.dataSource.getRepository(ExecutionEntity).update({ id: execution.id }, changes);
    Object.assign(execution, changes);
  }
}

function executionEvent(execution: ExecutionEntity): ExecutionStreamEvent {
  return { data: toExecutionDto(execution), event: EXECUTION_SSE_EVENT };
}

function conversationEvent(conversation: Conversation): ExecutionStreamEvent {
  return { data: conversation, event: CONVERSATION_SSE_EVENT };
}

/** The native `error` event carries `{ error, message }`; keep the message, never the payload. */
function errorOf(data: unknown): Error {
  if (typeof data === 'object' && data !== null) {
    const { message, error } = data as { readonly message?: unknown; readonly error?: unknown };
    if (typeof message === 'string') return new Error(message);
    if (typeof error === 'string') return new Error(error);
  }
  return new Error('Runtime reported an error.');
}
