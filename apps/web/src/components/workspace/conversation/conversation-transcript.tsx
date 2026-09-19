import { Bot, LoaderCircle, User } from 'lucide-react';
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
}

function Turn({ author, content, pending = false, error = null, statusText = null }: TurnProps) {
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
