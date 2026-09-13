import { MessageSquareText, Pin } from 'lucide-react';

import {
  ConversationActionMenu,
  type ConversationActionHandlers,
} from '@/components/workspace/conversation/conversation-action-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { Conversation } from '@/lib/workspace/workspace.types';

interface ConversationNavigationProps {
  readonly conversationActions: ConversationActionHandlers;
  readonly conversations: readonly Conversation[];
  readonly selectedId: string | undefined;
  /** Chat whose answer is streaming right now; its row shows a live indicator. */
  readonly streamingId?: string;
  readonly onSelect: (id: string) => void;
  /** Tighter rows for chats nested under a project. */
  readonly compact?: boolean;
}

export function ConversationNavigation({
  compact = false,
  conversationActions,
  conversations,
  selectedId,
  streamingId,
  onSelect,
}: ConversationNavigationProps) {
  return (
    <ul className={compact ? 'space-y-0.5' : 'space-y-1'}>
      {conversations.map((item) => (
        <li key={item.id} className="flex min-w-0 items-center gap-1">
          <Button
            variant="ghost"
            aria-current={selectedId === item.id ? 'page' : undefined}
            className={cn(
              'flex h-auto min-w-0 flex-1 items-center justify-start whitespace-nowrap gap-2 rounded-lg px-2.5 text-left text-2xs font-normal leading-relaxed text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring motion-reduce:transition-none',
              compact
                ? 'min-h-7 py-1 group-data-[density=compact]/workspace:min-h-6'
                : 'min-h-10 py-2 group-data-[density=compact]/workspace:min-h-8 group-data-[density=compact]/workspace:py-1',
              selectedId === item.id && 'bg-sidebar-accent text-sidebar-accent-foreground',
            )}
            onClick={() => onSelect(item.id)}
            type="button"
          >
            <MessageSquareText aria-hidden="true" className="shrink-0 opacity-65" size={13} />
            {item.pinnedAt !== null ? (
              <Pin aria-hidden="true" size={12} className="shrink-0 text-muted-foreground" />
            ) : null}
            {/* Keyed by title so a runtime-generated title fades in over the provisional one. */}
            <span
              className="title-appear min-w-0 flex-1 truncate"
              key={item.title}
              title={item.title}
            >
              {item.title}
            </span>
            {streamingId === item.id ? (
              <>
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full bg-primary animate-pulse motion-reduce:animate-none"
                />
                <span className="sr-only">Réponse en cours</span>
              </>
            ) : null}
          </Button>
          <ConversationActionMenu conversation={item} {...conversationActions} />
        </li>
      ))}
    </ul>
  );
}
