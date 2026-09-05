import { MessageSquareText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { ConversationView } from '@/lib/workspace/workspace.types';

interface ConversationNavigationProps {
  readonly conversations: readonly ConversationView[];
  readonly selectedId: string | undefined;
  readonly onSelect: (id: string) => void;
}

export function ConversationNavigation({
  conversations,
  selectedId,
  onSelect,
}: ConversationNavigationProps) {
  return (
    <ul className="space-y-1">
      {conversations.map((item) => (
        <li key={item.id}>
          <Button
            variant="ghost"
            aria-current={selectedId === item.id ? 'true' : undefined}
            className={cn(
              'flex h-auto min-h-10 w-full items-center justify-start whitespace-normal gap-2 rounded-lg px-2.5 py-2 text-left text-2xs font-normal leading-relaxed text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring motion-reduce:transition-none group-data-[density=compact]/workspace:min-h-8 group-data-[density=compact]/workspace:py-1',
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
