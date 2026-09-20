import type { WorkStepKind } from '@alfred/contracts';

/**
 * Why a committed projection could not continue the frames already sent. Every rule is either
 * impossible by construction in the projection (the log only adds steps, grows open text and
 * closes steps) or a documented residual case:
 *
 * - `withdrawn`: a step already sent disappeared. A later exclusion is refused by the reducer and
 *   a round trip without output is only reported once a later one began, so this needs two root
 *   round trips producing at once (an earlier message gaining a tool call after a later one
 *   began), which the orchestrator does not do.
 * - `answer_reopened`: a narration grew again and became the answer (the same concurrency).
 * - `reshaped`: a step changed kind or owner. Invocations are withheld while any delegation could
 *   own them, whatever the names, and inferred only when one delegation of their specialist
 *   remains (a delegation that ended without naming its namespace stays a candidate). The residual
 *   case is a specialist streaming under the name of another specialist requested in parallel,
 *   whose result then contradicts the inference (`subagent_withdrawn` on the inferred delegation,
 *   `reshaped` on the steps that move).
 * - `regressed`: a step reopened or changed its outcome (the reducer keeps the first outcome).
 * - `text_not_prefix`: a step's text was rewritten, only possible with cumulative native modes
 *   the adapter does not request.
 * - `text_after_close`: text grew on a step already closed (the reducer continues it as a new step).
 * - `subagent_withdrawn` / `subagent_regressed`: a delegation lost or reopened its specialist (the
 *   residual link case above).
 * - `answer_withdrawn` / `answer_not_prefix` / `answer_replaced`: the open answer vanished, was
 *   rewritten (cumulative modes), or was replaced without leaving narration (step bound reached).
 */
export type AgUiGapRule =
  | 'withdrawn'
  | 'answer_reopened'
  | 'reshaped'
  | 'regressed'
  | 'text_not_prefix'
  | 'text_after_close'
  | 'subagent_withdrawn'
  | 'subagent_regressed'
  | 'answer_withdrawn'
  | 'answer_not_prefix'
  | 'answer_replaced';

/** The kind of step the rule fired on; `answer` is the open orchestrator message. */
export type AgUiGapStepKind = WorkStepKind | 'answer';

/**
 * The projection moved in a way AG-UI cannot express as a continuation. The observer closes and
 * the browser re-attaches for a fresh synthesis. Carries only the rule and the step kind: never
 * text, and no identifier beyond what the log line itself names.
 */
export class AgUiTranslationGap extends Error {
  constructor(
    readonly rule: AgUiGapRule,
    readonly stepKind: AgUiGapStepKind,
  ) {
    super(`The observed projection does not continue the frames already sent (${rule}).`);
    this.name = 'AgUiTranslationGap';
  }
}
