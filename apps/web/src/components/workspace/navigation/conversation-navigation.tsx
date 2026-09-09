import { MessageSquareText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { Conversation } from '@/lib/workspace/workspace.types';

interface ConversationNavigationProps {
  readonly conversations: readonly Conversation[];
  readonly selectedId: string | undefined;
  readonly onSelect: (id: string) => void;
  /** Tighter rows for chats nested under a project. */
  readonly compact?: boolean;
}

export function ConversationNavigation({
  compact = false,
  conversations,
  selectedId,
  onSelect,
}: ConversationNavigationProps) {
  return (
    <ul className={compact ? 'space-y-0.5' : 'space-y-1'}>
      {conversations.map((item) => (
        <li key={item.id}>
          <Button
            variant="ghost"
            aria-current={selectedId === item.id ? 'page' : undefined}
            className={cn(
              'flex h-auto w-full items-center justify-start whitespace-normal gap-2 rounded-lg px-2.5 text-left text-2xs font-normal leading-relaxed text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring motion-reduce:transition-none',
              compact
                ? 'min-h-7 py-1 group-data-[density=compact]/workspace:min-h-6'
                : 'min-h-10 py-2 group-data-[density=compact]/workspace:min-h-8 group-data-[density=compact]/workspace:py-1',
              selectedId === item.id && 'bg-sidebar-accent text-sidebar-accent-foreground',
            )}
            onClick={() => onSelect(item.id)}
            type="button"
          >
            <MessageSquareText aria-hidden="true" className="shrink-0 opacity-65" size={13} />
            <span className="min-w-0 wrap-anywhere">{item.title}</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}
