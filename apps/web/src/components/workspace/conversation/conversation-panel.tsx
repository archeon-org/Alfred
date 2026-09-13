import { LockKeyhole, MessageSquareText } from 'lucide-react';
import type { Ref } from 'react';

import { ConversationTranscript } from '@/components/workspace/conversation/conversation-transcript';
import { ConversationWelcome } from '@/components/workspace/conversation/conversation-welcome';
import { MessageComposer } from '@/components/workspace/conversation/message-composer';
import { Skeleton } from '@/components/ui/skeleton';
import { ConversationSkeleton } from '@/components/workspace/workspace-skeletons';
import type { TurnFailure } from '@/hooks/conversations/use-conversation-chat';
import type { LiveSession } from '@/contexts/chat-session/chat-session-context';
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
  /** Resolves true when the message was accepted; the composer keeps the draft otherwise. */
  readonly onSend?: (message: string) => boolean | Promise<boolean>;
  /** Shown instead of the composer help while sending is refused; typing stays possible. */
  readonly blockedReason?: string | null;
  readonly isStreaming?: boolean;
  readonly onStop?: () => void;
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
  onSend,
  blockedReason = null,
  isStreaming = false,
  onStop,
}: ConversationPanelProps) {
  const hasTranscript = messages.length > 0 || sessions.length > 0;
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
        <div className="flex min-h-18 shrink-0 items-center gap-2.5 border-b border-border px-4 py-3 md:min-h-21 md:gap-3 md:px-6 md:py-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-muted text-muted-foreground">
            <MessageSquareText aria-hidden="true" size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-2xs font-semibold tracking-label text-muted-foreground">
              VOTRE CONVERSATION
            </p>
            <h1 className="text-xs font-semibold truncate tracking-tight md:text-sm">
              {title ?? 'Nouvelle conversation'}
            </h1>
          </div>
          <span className="ml-auto flex items-center gap-1 text-2xs whitespace-nowrap text-muted-foreground  [&_svg]:size-3.5 md:[&_svg]:size-3">
            <LockKeyhole aria-hidden="true" size={12} />
            <span className="sr-only md:not-sr-only">Personnel</span>
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col workspace:[container-type:size] workspace:[container-name:welcome] [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin] workspace:overflow-y-auto">
          {notice ? (
            <p
              className="mx-4 mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive md:mx-6"
              role="alert"
            >
              {notice}
            </p>
          ) : null}
          {isLoading ? (
            <ConversationSkeleton />
          ) : hasTranscript ? (
            <ConversationTranscript messages={messages} sessions={sessions} failure={failure} />
          ) : (
            <ConversationWelcome disabled={isBusy} prompts={prompts} onSelect={onPrompt} />
          )}
        </div>
        {isLoading ? (
          <div
            className="mx-auto w-full max-w-conversation shrink-0 px-4 py-4 md:px-6 md:pt-4 md:pb-5 wide:px-8"
            aria-hidden="true"
          >
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        ) : (
          <MessageComposer
            defaultValue={draft}
            key={draft ?? ''}
            onSend={onSend}
            isBusy={isBusy}
            blockedReason={blockedReason}
            isStreaming={isStreaming}
            onStop={onStop}
          />
        )}
      </section>
    </main>
  );
}
