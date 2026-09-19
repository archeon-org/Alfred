import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { EXECUTION_JSON_PROFILE } from '@alfred/contracts';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { DataSource } from 'typeorm';
import { vi, type Mock, type MockInstance } from 'vitest';

import type { ConversationsService } from '@api/modules/conversations/application/conversations.service';
import { toConversationDto } from '@api/modules/conversations/domain/conversation';
import { ExecutionObservationService } from '@api/modules/executions/application/execution-observation.service';
import type { ExecutionsService } from '@api/modules/executions/application/executions.service';
import {
  projectionText,
  type ProjectionState,
} from '@api/modules/executions/infrastructure/langgraph/runtime-projection';
import { ExecutionEntity } from '@api/modules/executions/infrastructure/persistence/execution.entity';
import { ExecutionObserverService } from '@api/modules/stream/application/execution-observer.service';
import type { ObservationEndRecord } from '@api/modules/stream/application/observation-end';
import type { StreamAuthorityService } from '@api/modules/stream/application/stream-authority.service';
import {
  agUiEventNames,
  parseAgUiChunks,
  reduceAgUiFrames,
  verifyAgUiRuns,
  type ObservedReplica,
} from './ag-ui-frames';
import { conversationRow } from './project-fixtures';

export const observedExecutionId = 'f9dfb431-2928-42c1-980d-97383a4016bd';
export const observedInvocationId = 'b0326b3c-2f93-4c53-9808-32ac6110892c';
const generation = 'a3094b40-dd66-4759-abd1-14a39c164ad8';

/** An in-memory Express response that records SSE chunks and emits `close` when destroyed. */
export class ObserverResponse extends EventEmitter {
  readonly chunks: string[] = [];
  destroyed = false;
  writableEnded = false;
  writableLength = 0;
  readonly status: Mock<(code: number) => void> = vi.fn();
  readonly setHeader: Mock<(name: string, value: string) => void> = vi.fn();
  readonly flushHeaders: Mock<() => void> = vi.fn();
  readonly write = vi.fn((chunk: string) => {
    this.chunks.push(chunk);
    return true;
  });
  readonly end = vi.fn(() => {
    this.writableEnded = true;
  });
  readonly destroy = vi.fn(() => {
    this.destroyed = true;
    this.emit('close');
    return this;
  });
  asExpress(): Response {
    return this as unknown as Response;
  }
  /** Public frames as the browser reconstructs them from the AG-UI events, one per frame. */
  snapshots(): ObservedReplica[] {
    return reduceAgUiFrames(parseAgUiChunks(this.chunks));
  }
  frameNames(): string[] {
    return agUiEventNames(parseAgUiChunks(this.chunks));
  }
  /** Every attach must satisfy the official AG-UI verifier. */
  verified(): Promise<number> {
    return verifyAgUiRuns(parseAgUiChunks(this.chunks));
  }
}

/** A committed row as the observation service loads it. */
export function observedRow(state: ProjectionState, overrides: Partial<ExecutionEntity> = {}) {
  const conversation = conversationRow();
  const row = Object.assign(new ExecutionEntity(), {
    id: observedExecutionId,
    conversationId: conversation.id,
    invocationId: observedInvocationId,
    bindingGeneration: generation,
    sourceWatermark: state.sourceId,
    publicText: projectionText(state),
    projectionRevision: state.sequence,
    responseProfile: EXECUTION_JSON_PROFILE,
    reducerState: state,
    createdAt: new Date('2026-09-14T10:00:00Z'),
    startedAt: null,
    finishedAt: null,
    error: null,
    status: 'running' as const,
    ...overrides,
  });
  return {
    row,
    conversation: toConversationDto(conversation, 'named'),
    state,
    userMessage: 'Hello?',
    attachments: [],
  };
}

export type ObservedLoad = ReturnType<typeof observedRow>;

export interface ObserverFixture {
  readonly service: ExecutionObserverService;
  readonly authority: { readonly assert: Mock<() => Promise<number>> };
  readonly load: MockInstance<ExecutionObservationService['load']>;
  readonly setLoaded: (next: ObservedLoad) => void;
}

/** The observer with its durable read and authority replaced by controllable doubles. */
export function observerFixture(
  initial: ObservedLoad,
  options: Record<string, unknown> = {},
): ObserverFixture {
  let current = initial;
  const config = new ConfigService({
    EXECUTION_CURSOR_KEY: randomBytes(32).toString('hex'),
    ...options,
  });
  const observations = new ExecutionObservationService(
    {} as ExecutionsService,
    {} as ConversationsService,
    {} as DataSource,
    config,
  );
  const load = vi.spyOn(observations, 'load').mockImplementation(() => Promise.resolve(current));
  const authority = {
    assert: vi.fn(() => Promise.resolve(Date.now() + 300_000)),
  };
  const service = new ExecutionObserverService(
    observations,
    authority as unknown as StreamAuthorityService,
    config,
  );
  return {
    service,
    authority,
    load,
    setLoaded: (next: ObservedLoad) => {
      current = next;
    },
  };
}

/** Captures the structured end lines the observer logs, silencing every other log line. */
export function captureObservationEnds() {
  const lines: { readonly level: 'info' | 'warn'; readonly record: ObservationEndRecord }[] = [];
  const keep = (level: 'info' | 'warn') => (message: unknown) => {
    if (typeof message !== 'string' || !message.includes('execution_observation_ended')) return;
    lines.push({ level, record: JSON.parse(message) as ObservationEndRecord });
  };
  vi.spyOn(Logger.prototype, 'log').mockImplementation(keep('info'));
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(keep('warn'));
  return lines;
}
