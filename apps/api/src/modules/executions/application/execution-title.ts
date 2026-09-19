import { sanitizeGeneratedTitle } from '../domain/execution';
import type { ExecutionStateStore } from '../infrastructure/persistence/execution-state.store';
import type { ExecutionEntity } from '../infrastructure/persistence/execution.entity';
import type { RuntimeClient } from './runtime-client.port';

/** The title graph answers within seconds; this budget is independent of the processing signal. */
const TITLE_TIMEOUT_MS = 20_000;

/**
 * The generated title belongs to the conversation and may arrive after the execution finished, so
 * it is neither bound to the processing signal nor written under the execution fence. A missing
 * answer keeps the request pending; an unusable answer settles it without touching the title.
 */
export function requestConversationTitle(
  row: ExecutionEntity,
  runtime: RuntimeClient,
  states: ExecutionStateStore,
): void {
  if (!row.titleRequested) return;
  void runtime
    .generateTitle(row.id, row.invocationId, AbortSignal.timeout(TITLE_TIMEOUT_MS))
    .then(async (generated) => {
      if (generated === null) return;
      await states.applyTitle(row, sanitizeGeneratedTitle(generated));
    })
    .catch(() => {
      /* Keep the provisional title if the model or the conversation is unavailable. */
    });
}
