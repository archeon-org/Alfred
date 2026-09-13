import { Bot, ChevronRight, LoaderCircle, User } from 'lucide-react';
import { Fragment, useEffect, useRef } from 'react';

import { MarkdownView } from '@/components/ui/markdown-view';
import type { RuntimeEventView, TurnFailure } from '@/hooks/conversations/use-conversation-chat';
import { cn } from '@/lib/cn';
import type { LiveSession } from '@/contexts/chat-session/chat-session-context';
import { transcriptEntries } from '@/lib/workspace/transcript-entries';
import type { Message } from '@/services/executions/executions.service';

interface ConversationTranscriptProps {
  readonly messages: readonly Message[];
  readonly sessions: readonly LiveSession[];
  /** Error of a settled turn, shown under the last stored row of its execution. */
  readonly failure?: TurnFailure | null;
}

const EVENT_PREVIEW_LENGTH = 240;

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
            />
            <RuntimeEvents events={entry.session.turn.events} />
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
}

function Turn({ author, content, pending = false, error = null }: TurnProps) {
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
        {error ? (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function RuntimeEvents({ events }: { readonly events: readonly RuntimeEventView[] }) {
  if (events.length === 0) return null;
  return (
    <li>
      <details className="group rounded-xl border border-border bg-muted/40 text-xs">
        <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 font-medium text-muted-foreground select-none">
          <ChevronRight
            aria-hidden="true"
            className="transition-transform group-open:rotate-90 motion-reduce:transition-none"
            size={14}
          />
          Événements du runtime ({events.length})
        </summary>
        <ol className="max-h-72 overflow-y-auto border-t border-border font-mono [scrollbar-width:thin]">
          {events.map((entry) => (
            <li
              key={entry.id}
              className="flex gap-2 border-b border-border/60 px-3 py-1.5 last:border-b-0"
            >
              <span className="shrink-0 font-semibold text-foreground">{entry.event}</span>
              <span className="min-w-0 truncate text-muted-foreground">{preview(entry.data)}</span>
            </li>
          ))}
        </ol>
      </details>
    </li>
  );
}

function preview(data: unknown): string {
  let text: string;
  try {
    text = typeof data === 'string' ? data : (JSON.stringify(data) ?? 'null');
  } catch {
    text = '[non sérialisable]';
  }
  return text.length > EVENT_PREVIEW_LENGTH ? `${text.slice(0, EVENT_PREVIEW_LENGTH)}…` : text;
}
