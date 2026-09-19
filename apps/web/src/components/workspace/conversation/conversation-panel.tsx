import type { Ref } from 'react';

import { ConversationTranscript } from '@/components/workspace/conversation/conversation-transcript';
import { ConversationWelcome } from '@/components/workspace/conversation/conversation-welcome';
import { MessageComposer } from '@/components/workspace/conversation/message-composer';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ConversationSkeleton } from '@/components/workspace/workspace-skeletons';
import type { TurnFailure } from '@/hooks/conversations/use-conversation-chat';
import { useStickToBottom } from '@/hooks/ui/use-stick-to-bottom';
import type { LiveSession, RuntimeEventView } from '@/contexts/chat-session/chat-session-context';
import type { StarterPrompt } from '@/lib/workspace/workspace.types';
import type { Message } from '@/services/executions/executions.service';

interface ConversationPanelProps {
  readonly ref: Ref<HTMLElement>;
  readonly title: string | undefined;
  /** Draft carried over from a project input; shown in the composer, never persisted. */
  readonly draft?: string;
  readonly prompts: readonly StarterPrompt[];
  readonly isLoading: boolean;
  readonly isBusy?: boolean;
  readonly notice?: string | null;
  readonly onPrompt: (prompt: StarterPrompt) => void;
  /** Stored transcript plus the turn being answered; the welcome screen shows while both are empty. */
  readonly messages?: readonly Message[];
  readonly sessions?: readonly LiveSession[];
  readonly failure?: TurnFailure | null;
  readonly debugEvents?: readonly RuntimeEventView[];
  readonly debugError?: string | null;
  /** The API serves trace links for answers (development diagnostic). */
  readonly traceLinksEnabled?: boolean;
  /** Resolves true when the message was accepted; the composer keeps the draft otherwise. */
  readonly onSend?: (message: string) => boolean | Promise<boolean>;
  /** Shown instead of the composer help while sending is refused; typing stays possible. */
  readonly blockedReason?: string | null;
  readonly isStreaming?: boolean;
  readonly onStop?: () => void;
  readonly onReconnect?: () => void;
  readonly recoveryAvailable?: boolean;
}

export function ConversationPanel({
  ref,
  title,
  draft,
  prompts,
  isLoading,
  isBusy = false,
  notice,
  onPrompt,
  messages = [],
  sessions = [],
  failure = null,
  debugEvents = [],
  debugError = null,
  traceLinksEnabled = false,
  onSend,
  blockedReason = null,
  isStreaming = false,
  onStop,
  onReconnect,
  recoveryAvailable = false,
}: ConversationPanelProps) {
  const hasTranscript = messages.length > 0 || sessions.length > 0;
  // Only this scroll area is ever scrolled programmatically: it follows the bottom while the
  // person stays there, and sending a message brings them back to it.
  const { scrollRef, scrollToBottom } = useStickToBottom();
  const send =
    onSend === undefined
      ? undefined
      : (message: string) => {
          scrollToBottom();
          return onSend(message);
        };
  return (
    <main
      className="flex h-full min-h-0 min-w-0 outline-none focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-ring"
      id="main-content"
      ref={ref}
      tabIndex={-1}
    >
      <section
        className="flex min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-panel md:rounded-2xl workspace:min-h-0"
        id="conversation"
        aria-busy={isLoading || isBusy || isStreaming}
      >
        {/* The conversation title belongs to the page outline and to the sidebar's selection,
            not to a band above the transcript: the transcript keeps the height. */}
        <h1 className="sr-only">{title ?? 'Nouvelle conversation'}</h1>
        {/* The transcript scrolls inside the card at every width, above a composer that stays in
            place. The welcome screen fits itself to this area through its container queries.
            Clicking its text focuses it, so that the scrolling keys scroll it, without adding a
            tab stop; the keys pressed while <main> holds the focus are handed to it as well. */}
        <div
          className="flex min-h-0 flex-1 flex-col overflow-y-auto outline-none [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring workspace:[container-type:size] workspace:[container-name:welcome]"
          data-slot="conversation-scroll"
          ref={scrollRef}
          tabIndex={-1}
        >
          {notice ? (
            <p
              className="mx-4 mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive md:mx-6"
              role="alert"
            >
              {notice}
            </p>
          ) : null}
          {recoveryAvailable ? (
            <div className="mx-4 mt-3 md:mx-6">
              <Button onClick={onReconnect} variant="outline" size="sm">
                Reconnecter et vérifier l’état
              </Button>
            </div>
          ) : null}
          {debugError !== null ? (
            <p
              className="mx-auto mt-3 w-full max-w-conversation px-4 text-xs text-destructive md:px-6 wide:px-8"
              role="alert"
            >
              {debugError}
            </p>
          ) : null}
          {isLoading ? (
            <ConversationSkeleton />
          ) : hasTranscript ? (
            <ConversationTranscript
              messages={messages}
              sessions={sessions}
              failure={failure}
              debugEvents={debugEvents}
              traceLinksEnabled={traceLinksEnabled}
            />
          ) : (
            <ConversationWelcome disabled={isBusy} prompts={prompts} onSelect={onPrompt} />
          )}
        </div>
        {isLoading ? (
          <div
            className="mx-auto w-full max-w-conversation shrink-0 px-4 pb-4 md:px-6 md:pb-5 wide:px-8"
            aria-hidden="true"
          >
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        ) : (
          <MessageComposer
            defaultValue={draft}
            key={draft ?? ''}
            onSend={send}
            isBusy={isBusy}
            blockedReason={blockedReason}
            isStreaming={isStreaming}
            onStop={onStop}
            isStopping={sessions.at(-1)?.turn.stopPending}
          />
        )}
      </section>
    </main>
  );
}
