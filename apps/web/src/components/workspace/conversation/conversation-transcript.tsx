import type { ExecutionActivity } from '@alfred/contracts';
import { Bot, Check, LoaderCircle, User, X } from 'lucide-react';
import { Fragment, useEffect, useRef } from 'react';

import { MarkdownView } from '@/components/ui/markdown-view';
import type { TurnFailure } from '@/hooks/conversations/use-conversation-chat';
import { cn } from '@/lib/cn';
import type { LiveSession, LiveTurn } from '@/contexts/chat-session/chat-session-context';
import { transcriptEntries } from '@/lib/workspace/transcript-entries';
import type { Message } from '@/services/executions/executions.service';

interface ConversationTranscriptProps {
  readonly messages: readonly Message[];
  readonly sessions: readonly LiveSession[];
  /** Error of a settled turn, shown under the last stored row of its execution. */
  readonly failure?: TurnFailure | null;
}

/** Stored and local turns, kept in order until persistence takes over from each stream. */
export function ConversationTranscript({
  messages,
  sessions,
  failure = null,
}: ConversationTranscriptProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const live = sessions.at(-1)?.turn;
  const liveLength = live?.assistantText.length ?? 0;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, liveLength, live?.status]);
  const failedRow =
    failure === null
      ? undefined
      : messages.findLast((message) => message.executionId === failure.executionId)?.id;

  return (
    <ol className="mx-auto flex w-full max-w-conversation flex-col gap-4 px-4 py-4 md:px-6 wide:px-8">
      {transcriptEntries(messages, sessions).map((entry) =>
        entry.kind === 'message' ? (
          <Turn
            key={entry.message.id}
            author={entry.message.role}
            content={entry.message.content}
            error={entry.message.id === failedRow ? failure?.error : null}
          />
        ) : (
          <Fragment key={`session-${entry.session.id}`}>
            <Turn author="user" content={entry.session.turn.userMessage} />
            <Turn
              author="assistant"
              content={entry.session.turn.assistantText}
              pending={entry.session.turn.status === 'streaming'}
              error={entry.session.turn.error}
              statusText={observationStatus(entry.session.turn)}
              activities={entry.session.turn.activities}
            />
          </Fragment>
        ),
      )}
      <div ref={endRef} aria-hidden="true" />
    </ol>
  );
}

interface TurnProps {
  readonly author: Message['role'];
  readonly content: string;
  readonly pending?: boolean;
  readonly error?: string | null;
  readonly statusText?: string | null;
  /** Tool calls reported for a live turn; stored rows carry none. */
  readonly activities?: readonly ExecutionActivity[];
}

function Turn({
  author,
  content,
  pending = false,
  error = null,
  statusText = null,
  activities = [],
}: TurnProps) {
  const isUser = author === 'user';
  return (
    <li className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <span
        aria-hidden="true"
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-full border border-border',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {isUser ? <User size={15} /> : <Bot size={15} />}
      </span>
      <div
        className={cn(
          'min-w-0 max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser ? 'bg-primary/10' : 'border border-border bg-background',
        )}
      >
        <p className="sr-only">{isUser ? 'Vous' : 'Alfred'}</p>
        {activities.length > 0 ? <Activities activities={activities} /> : null}
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : content.length > 0 ? (
          <MarkdownView source={content} />
        ) : pending ? (
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
      </div>
    </li>
  );
}

const ACTIVITY_STATUS = {
  running: { icon: LoaderCircle, label: 'en cours', className: 'animate-spin' },
  completed: { icon: Check, label: 'terminé', className: '' },
  failed: { icon: X, label: 'échoué', className: 'text-destructive' },
} as const;

/** Compact list of the tools Alfred used for this answer: safe label and status only. */
function Activities({ activities }: { readonly activities: readonly ExecutionActivity[] }) {
  return (
    <ul
      aria-label="Outils utilisés"
      className="mb-2 flex flex-col gap-1 text-xs text-muted-foreground"
    >
      {activities.map((activity) => {
        const status = ACTIVITY_STATUS[activity.status];
        const Icon = status.icon;
        return (
          <li key={activity.id} className="flex items-center gap-1.5">
            <Icon aria-hidden="true" className={cn('shrink-0', status.className)} size={12} />
            <span className="truncate font-mono">{activity.label}</span>
            <span className="sr-only">{status.label}</span>
          </li>
        );
      })}
    </ul>
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
