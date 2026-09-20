import type { AlfredRunState } from '@alfred/contracts';
import { verifyEvents } from '@ag-ui/client';
import { from, lastValueFrom, toArray } from 'rxjs';

import { toConversationDto } from '@api/modules/conversations/domain/conversation';
import {
  emptyProjection,
  projectRuntimeEvent,
  type ProjectionState,
} from '@api/modules/executions/infrastructure/langgraph/runtime-projection';
import {
  projectionMessages,
  projectionWork,
} from '@api/modules/executions/infrastructure/langgraph/runtime-projection-work';
import {
  translateObservedView,
  type AgUiEvent,
  type ObservedView,
} from '@api/modules/stream/application/ag-ui-translation';
import { conversationRow } from './project-fixtures';

export const continuityInvocation = 'invocation-one';
export type NativeFrame = { readonly id: string; readonly event: string; readonly data: unknown };

/** A private specialist namespace made of one repeated hexadecimal letter. */
export const namespaceOf = (letter: string): string =>
  `tools:${letter.repeat(8)}-${letter.repeat(4)}-4${letter.repeat(3)}-8${letter.repeat(3)}-${letter.repeat(12)}`;

export const ai = (id: string, content: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'AIMessageChunk',
  content,
  ...extra,
});
export const thinking = (id: string, text: string, content = '') =>
  ai(id, content, { additional_kwargs: { reasoning_content: text } });
export const task = (id: string) => ({ id, name: 'task', args: {} });
export const tool = (id: string, name = 'execute_raw') => ({ id, name, args: {} });
export const result = (
  callId: string,
  extra: Record<string, unknown> = {},
  status = 'success',
) => ({
  type: 'tool',
  tool_call_id: callId,
  content: 'PRIVATE RESULT',
  status,
  ...extra,
});

/**
 * Native frames of one scripted run on their own clock: positions are `<13-digit ms>-0`, each
 * frame `step` ms after the previous one.
 */
export function nativeScript(start = 1_000, step = 100) {
  let clock = start;
  const frame = (event: string, data: unknown): NativeFrame => {
    clock += step;
    return { id: `${String(clock).padStart(13, '0')}-0`, event, data };
  };
  return {
    frame,
    now: () => clock,
    root: (message: unknown) => frame('messages', [message, { langgraph_node: 'model' }]),
    child: (namespace: string, name: string | null, message: unknown) =>
      frame(`messages|${namespace}`, [
        message,
        name === null
          ? { langgraph_node: 'model' }
          : { lc_agent_name: name, langgraph_node: 'model' },
      ]),
    childResult: (namespace: string, name: string | null, callId: string) =>
      frame(`messages|${namespace}`, [
        result(callId),
        name === null
          ? { langgraph_node: 'tools' }
          : { lc_agent_name: name, langgraph_node: 'tools' },
      ]),
    /** The delegation's own result; `namespace` null when the runtime omits it. */
    delegationResult: (callId: string, namespace: string | null, status = 'success') =>
      frame('messages', [
        result(callId, { name: 'task' }, status),
        namespace === null
          ? { langgraph_node: 'tools' }
          : { langgraph_checkpoint_ns: `${namespace}|model:1`, langgraph_node: 'tools' },
      ]),
    specialists: (calls: Readonly<Record<string, string>>) =>
      frame('updates', {
        model: {
          messages: [
            {
              id: 'm1',
              type: 'ai',
              content: '',
              tool_calls: Object.entries(calls).map(([id, subagent_type]) => ({
                id,
                name: 'task',
                args: { subagent_type, description: 'PRIVATE PROMPT' },
              })),
            },
          ],
        },
      }),
  };
}

const conversation = toConversationDto(conversationRow(), 'named');

/** The observed view of one projection, as the observer derives it from a committed row. */
export function continuityView(
  state: ProjectionState,
  settled: boolean,
  endedAt: number,
): ObservedView {
  const runState: AlfredRunState = {
    execution: {
      id: 'f9dfb431-2928-42c1-980d-97383a4016bd',
      conversationId: conversation.id,
      status: settled ? 'completed' : 'running',
      error: null,
      errorCode: null,
      createdAt: '2026-09-16T10:00:00.000Z',
      startedAt: '2026-09-16T10:00:00.000Z',
      finishedAt: settled ? '2026-09-16T10:10:00.000Z' : null,
    },
    conversation,
    userMessage: 'Question?',
  };
  const work = projectionWork(state, {
    settled,
    endedAt: settled ? endedAt : null,
    textLimit: Number.POSITIVE_INFINITY,
  });
  return {
    state: runState,
    answer: projectionMessages(state).at(-1) ?? null,
    steps: work.steps,
    omittedSteps: work.omittedSteps,
    settled,
  };
}

/** The projection after every frame, as a worker committing each event would expose it. */
export function replayFrames(frames: readonly NativeFrame[], endedAt = 0) {
  const states: ProjectionState[] = [];
  let state = emptyProjection();
  for (const next of frames) {
    state = projectRuntimeEvent(state, next, continuityInvocation, { content: true });
    states.push(state);
  }
  const settledAt = Math.max(endedAt, state.lastEventAt ?? 0);
  return {
    states,
    views: [
      ...states.map((s) => continuityView(s, false, settledAt)),
      continuityView(state, true, settledAt),
    ],
  };
}

export const verifiedEvents = (events: readonly AgUiEvent[]) =>
  lastValueFrom(from(events as never[]).pipe(verifyEvents(), toArray()));

/**
 * An observer may attach after any commit and then see any later commit: every such pair must
 * continue without a gap, and every attach must satisfy the official verifier to its end.
 */
export async function expectContinuous(views: readonly ObservedView[]): Promise<void> {
  for (let attach = 0; attach < views.length; attach += 1) {
    for (const stride of [1, 2, 3]) {
      const events = translateObservedView(null, views[attach]!);
      let previous = views[attach]!;
      for (let index = attach + stride; index < views.length + stride - 1; index += stride) {
        const next = views[Math.min(index, views.length - 1)]!;
        events.push(...translateObservedView(previous, next));
        previous = next;
      }
      await verifiedEvents(events);
    }
  }
}

/** Nested steps as `[kind, parentId]` pairs. */
export const nestedSteps = (view: ObservedView) =>
  view.steps
    .filter((step) => step.parentId !== undefined)
    .map((step) => [step.kind, step.parentId]);
