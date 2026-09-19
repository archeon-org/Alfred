import {
  emptyProjection,
  projectRuntimeEvent,
  type ProjectionState,
} from '@api/modules/executions/infrastructure/langgraph/runtime-projection';
import { projectionWork } from '@api/modules/executions/infrastructure/langgraph/runtime-projection-work';

/** Scripted native events for the runtime projection specs. */
export const invocation = 'invocation-one';
export const NS_A = 'tools:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const NS_B = 'tools:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const chunk = (id: string, content: string, extra: Record<string, unknown> = {}) => ({
  content,
  id,
  type: 'AIMessageChunk',
  ...extra,
});
export const event = (id: string, name: string, data: unknown) => ({ data, event: name, id });
/** Native positions carry thirteen-digit millisecond clocks; small values are padded. */
export const at = (ms: number, seq = 0) => `${String(ms).padStart(13, '0')}-${seq}`;

/** Reduces a scripted sequence; native positions are millisecond timestamps as in production. */
export function reduce(
  frames: readonly ReturnType<typeof event>[],
  from = emptyProjection(),
  content = true,
) {
  return frames.reduce(
    (state, frame) => projectRuntimeEvent(state, frame, invocation, { now: 42, content }),
    from,
  );
}
/** The register default: hidden content is marked, never recorded. */
export const reduceMarkers = (
  frames: readonly ReturnType<typeof event>[],
  from = emptyProjection(),
) => reduce(frames, from, false);

export const work = (state: ProjectionState, settled = false, endedAt: number | null = null) =>
  projectionWork(state, { settled, endedAt });
