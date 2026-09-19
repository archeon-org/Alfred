import type { ExecutionObservationService } from '../../executions/application/execution-observation.service';
import { toExecutionDto } from '../../executions/domain/execution';
import { isExecutionSettled } from '../../executions/domain/execution-lifecycle';
import {
  projectionMessage,
  projectionToolCalls,
} from '../../executions/infrastructure/langgraph/runtime-projection';
import type { ObservedView } from './ag-ui-translation';

type Loaded = Awaited<ReturnType<ExecutionObservationService['load']>>;

/**
 * Public view of one committed projection. Rows written before the reducer existed keep their
 * saved text under a synthetic message identifier derived from the execution id only.
 */
export function observedView(loaded: Loaded): ObservedView {
  const execution = toExecutionDto(loaded.row);
  const message =
    loaded.state.sourceId === null
      ? loaded.row.publicText === ''
        ? null
        : { id: `${loaded.row.id}:answer`, text: loaded.row.publicText }
      : projectionMessage(loaded.state);
  return {
    state: { execution, conversation: loaded.conversation, userMessage: loaded.userMessage },
    message,
    toolCalls: projectionToolCalls(loaded.state),
    settled: isExecutionSettled(loaded.row),
  };
}
