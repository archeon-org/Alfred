import type { ExecutionSnapshot, MessageAttachment } from '@alfred/contracts';
import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { ApiException } from '../../../common/errors/api.exception';
import { ConversationsService } from '../../conversations/application/conversations.service';
import { MessageAttachmentsService } from '../../files/application/message-attachments.service';
import { createResumeCursor, readResumeCursor } from '../../stream/api/resume-cursor';
import { toExecutionDto } from '../domain/execution';
import { isExecutionSettled } from '../domain/execution-lifecycle';
import {
  emptyProjection,
  normalizeProjection,
  projectionActivities,
  projectionText,
  type ProjectionState,
} from '../infrastructure/langgraph/runtime-projection';
import { presentWork, projectionWork } from '../infrastructure/langgraph/runtime-projection-work';
import { ExecutionEntity } from '../infrastructure/persistence/execution.entity';
import { MessageEntity } from '../infrastructure/persistence/message.entity';
import { ExecutionsService } from './executions.service';

@Injectable()
export class ExecutionObservationService {
  constructor(
    private readonly executions: ExecutionsService,
    private readonly conversations: ConversationsService,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @Optional() private readonly attachments?: MessageAttachmentsService,
  ) {}

  /**
   * `known` carries the attachments an observer already read. A turn's files are fixed when it is
   * sent, so a stream that polls twice a second per observer reads them once, not at every tick.
   */
  async load(
    principal: AuthPrincipal,
    id: string,
    cursor?: string,
    known?: readonly MessageAttachment[],
  ) {
    const row = await this.executions.getObservation(principal, id);
    if (cursor !== undefined) {
      try {
        this.readCursor(cursor, row);
      } catch {
        throw new ApiException(
          409,
          'invalid_cursor',
          'The stream position is no longer available.',
        );
      }
    }
    const conversation = await this.conversations.get(principal, row.conversationId);
    const user = await this.dataSource
      .getRepository(MessageEntity)
      .findOne({ where: { executionId: id, role: 'user' } });
    const attachments =
      known ?? (user === null ? [] : ((await this.attachments?.forMessage(user.id)) ?? []));
    return {
      row,
      conversation,
      userMessage: user?.content ?? '',
      attachments,
      state: this.state(row),
    };
  }

  async snapshot(principal: AuthPrincipal, id: string): Promise<ExecutionSnapshot> {
    const loaded = await this.load(principal, id);
    return this.present(loaded);
  }

  present(
    loaded: Awaited<ReturnType<ExecutionObservationService['load']>>,
    state = loaded.state,
  ): ExecutionSnapshot {
    const settled = isExecutionSettled(loaded.row);
    return {
      execution: toExecutionDto(loaded.row),
      conversation: loaded.conversation,
      userMessage: loaded.userMessage,
      ...(loaded.attachments.length === 0 ? {} : { attachments: loaded.attachments }),
      assistantText: state.sourceId === null ? loaded.row.publicText : projectionText(state),
      activities: [...projectionActivities(state)],
      cursor: this.cursor(loaded, state),
      revision: state.sequence,
      work: presentWork(
        projectionWork(state, {
          settled,
          endedAt: settled ? (loaded.row.finishedAt?.getTime() ?? Date.now()) : null,
        }),
      ),
    };
  }

  /** Opaque, authenticated resume position of the committed projection (ALF-DEC-006 §4). */
  cursor(
    loaded: Awaited<ReturnType<ExecutionObservationService['load']>>,
    state = loaded.state,
  ): string {
    return createResumeCursor(
      { ...this.scope(loaded.row), nativePosition: state.sourceId, outputSubposition: 0 },
      this.config.getOrThrow<string>('EXECUTION_CURSOR_KEY'),
      { ttlMs: this.config.get<number>('EXECUTION_CURSOR_TTL_MS') ?? 3_600_000 },
    );
  }

  private readCursor(cursor: string, row: ExecutionEntity): void {
    const keys = [
      this.config.getOrThrow<string>('EXECUTION_CURSOR_KEY'),
      this.config.get<string>('EXECUTION_CURSOR_KEY_PREVIOUS'),
    ].filter((key): key is string => typeof key === 'string' && key.length >= 32);
    for (const key of keys) {
      try {
        readResumeCursor(cursor, this.scope(row), key);
        return;
      } catch {
        /* Try configured rotation key. */
      }
    }
    throw new Error('Invalid cursor');
  }

  private scope(row: ExecutionEntity) {
    return {
      executionId: row.id,
      invocationId: row.invocationId,
      generation: row.bindingGeneration,
      projectionVersion: 1,
      schemaVersion: 1 as const,
    };
  }

  private state(row: ExecutionEntity): ProjectionState {
    // The row and its reducer/watermark are read together from one atomic projection commit.
    if (row.sourceWatermark === null) return emptyProjection();
    const state = normalizeProjection(row.reducerState);
    if (
      state === null ||
      state.sourceId !== row.sourceWatermark ||
      state.sequence !== row.projectionRevision
    ) {
      throw new ApiException(409, 'runtime_recovery_required', 'The saved stream needs recovery.');
    }
    return state;
  }
}
