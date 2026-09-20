import type { ExecutionWork, ExecutionWorkSummary, Execution } from '@alfred/contracts';
import { LoaderCircle } from 'lucide-react';
import { Fragment, useDeferredValue } from 'react';

import { MarkdownView } from '@/components/ui/markdown-view';
import { ExecutionWorkLog } from '@/components/workspace/conversation/execution-work-log';
import { MessageAttachments } from '@/components/workspace/conversation/message-attachments';
import { StoredWorkLog } from '@/components/workspace/conversation/stored-work-log';
import { TurnActions } from '@/components/workspace/conversation/turn-actions';
import type { TurnFailure } from '@/hooks/conversations/use-conversation-chat';
import type {
  LiveSession,
  LiveTurn,
  RuntimeEventView,
} from '@/contexts/chat-session/chat-session-context';
import type { AttachmentView } from '@/lib/files/composer-attachments';
import { groupRuntimeEvents } from '@/lib/workspace/runtime-event-debug';
import { transcriptEntries } from '@/lib/workspace/transcript-entries';
import type { Message } from '@/services/executions/executions.service';

interface ConversationTranscriptProps {
  readonly messages: readonly Message[];
  readonly sessions: readonly LiveSession[];
  /** Error of a settled turn, shown under the last stored row of its execution. */
  readonly failure?: TurnFailure | null;
  /** Diagnostic events of this conversation; each answer shows the ones of its execution. */
  readonly debugEvents?: readonly RuntimeEventView[];
  readonly traceLinksEnabled?: boolean;
}

const NO_EVENTS: readonly RuntimeEventView[] = [];
const NO_ATTACHMENTS: readonly AttachmentView[] = [];

/** Stored and local turns, kept in order until persistence takes over from each stream. */
export function ConversationTranscript({
  messages,
  sessions,
  failure = null,
  debugEvents = NO_EVENTS,
  traceLinksEnabled = false,
}: ConversationTranscriptProps) {
  // Following the end of the transcript belongs to its scroll container (useStickToBottom in
  // ConversationPanel): scrolling an element into view would also move every ancestor.
  const failedRow =
    failure === null
      ? undefined
      : messages.findLast((message) => message.executionId === failure.executionId)?.id;
  const eventsByExecution = groupRuntimeEvents(debugEvents);
  const eventsOf = (executionId: string | null) =>
    executionId === null ? NO_EVENTS : (eventsByExecution.get(executionId) ?? NO_EVENTS);

  return (
    <ol className="mx-auto flex w-full max-w-conversation flex-col gap-6 px-4 py-4 md:px-6 wide:px-8">
      {transcriptEntries(messages, sessions).map((entry) =>
        entry.kind === 'message' ? (
          <Turn
            key={entry.message.id}
            author={entry.message.role}
            content={entry.message.content}
            error={entry.message.id === failedRow ? failure?.error : null}
            executionId={entry.message.executionId}
            events={eventsOf(entry.message.executionId)}
            traceLinksEnabled={traceLinksEnabled}
            {...(entry.message.work === undefined ? {} : { workSummary: entry.message.work })}
            {...(entry.message.attachments === undefined
              ? {}
              : { attachments: entry.message.attachments })}
          />
        ) : (
          <Fragment key={`session-${entry.session.id}`}>
            <Turn
              author="user"
              content={entry.session.turn.userMessage}
              {...(entry.session.turn.attachments === undefined
                ? {}
                : { attachments: entry.session.turn.attachments })}
            />
            <Turn
              author="assistant"
              content={entry.session.turn.assistantText}
              pending={entry.session.turn.status === 'streaming'}
              error={entry.session.turn.error}
              statusText={observationStatus(entry.session.turn)}
              work={entry.session.turn.work}
              execution={entry.session.turn.execution}
              executionId={entry.session.turn.execution?.id ?? null}
              events={eventsOf(entry.session.turn.execution?.id ?? null)}
              traceLinksEnabled={traceLinksEnabled}
            />
          </Fragment>
        ),
      )}
    </ol>
  );
}

interface TurnProps {
  readonly author: Message['role'];
  readonly content: string;
  readonly pending?: boolean;
  readonly error?: string | null;
  readonly statusText?: string | null;
  /** The work log of a live turn as AG-UI reports it. */
  readonly work?: ExecutionWork;
  readonly execution?: Execution | null;
  /** The account of a stored answer's work; its steps load when the log is opened. */
  readonly workSummary?: ExecutionWorkSummary;
  readonly executionId?: string | null;
  readonly events?: readonly RuntimeEventView[];
  readonly traceLinksEnabled?: boolean;
  /** The files a user turn carried; listed under its bubble. */
  readonly attachments?: readonly AttachmentView[];
}

/**
 * One turn of the transcript. The person's message sits in a bubble on the right; Alfred's answer
 * reads as page text under the log of its work, with its controls underneath once settled.
 */
function Turn({
  author,
  content,
  pending = false,
  error = null,
  statusText = null,
  work,
  execution = null,
  workSummary,
  executionId = null,
  events = NO_EVENTS,
  traceLinksEnabled = false,
  attachments = NO_ATTACHMENTS,
}: TurnProps) {
  // Markdown of a streaming answer is parsed at most once per frame: deltas arrive faster than a
  // long answer renders, and a stale parse is abandoned for the latest text instead of queued.
  const shown = useDeferredValue(content);
  if (author === 'user') {
    return (
      <li className="flex flex-col items-end">
        <p className="sr-only">Vous</p>
        {/* A message may be its files alone: no empty bubble then. */}
        {content.length > 0 ? (
          <div className="max-w-[85%] rounded-2xl bg-primary/10 px-4 py-3 text-sm leading-relaxed">
            <p className="whitespace-pre-wrap">{content}</p>
          </div>
        ) : null}
        <MessageAttachments attachments={attachments} />
      </li>
    );
  }
  return (
    <li className="group/turn flex min-w-0 flex-col text-sm leading-relaxed">
      <p className="sr-only">Alfred</p>
      {work !== undefined ? (
        <ExecutionWorkLog execution={execution} live={pending} work={work} />
      ) : workSummary !== undefined && executionId !== null ? (
        <StoredWorkLog executionId={executionId} summary={workSummary} />
      ) : null}
      {shown.length > 0 ? (
        <MarkdownView source={shown} />
      ) : pending && (work?.steps.length ?? 0) > 0 ? null : pending ? (
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="animate-spin" size={14} />
          Alfred réfléchit…
        </span>
      ) : error ? null : (
        <span className="text-muted-foreground">Aucune réponse.</span>
      )}
      {pending && content.length > 0 ? (
        <span className="sr-only" aria-live="polite">
          Réponse en cours
        </span>
      ) : null}
      {statusText ? (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {statusText}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {!pending && content.length > 0 ? (
        <TurnActions
          className="mt-1.5 -ml-1.5"
          content={content}
          executionId={executionId}
          events={events}
          traceLinksEnabled={traceLinksEnabled}
        />
      ) : null}
    </li>
  );
}

function observationStatus(turn: LiveTurn): string | null {
  if (turn.status !== 'streaming') return null;
  if (turn.stopPending) return 'Arrêt demandé… confirmation en cours.';
  if (turn.execution?.status === 'interrupted') return 'L’exécution attend une intervention.';
  if (turn.execution?.status === 'recovery_required')
    return 'L’exécution nécessite une vérification avant de poursuivre.';
  if (turn.connection === 'recovering') return 'Connexion interrompue… reconnexion en cours.';
  if (turn.connection === 'connecting') return 'Connexion en cours…';
  return null;
}
