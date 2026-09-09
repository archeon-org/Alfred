import { MessageSquareText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { QueryStatus } from '@/hooks/projects/use-projects-query';
import { formatDate } from '@/lib/workspace/format-date';
import type { Conversation } from '@/lib/workspace/workspace.types';

export interface ProjectChatListProps {
  readonly conversations: readonly Conversation[];
  readonly status: QueryStatus;
  readonly error: string | null;
  readonly hasMore: boolean;
  readonly isLoadingMore: boolean;
  readonly onLoadMore: () => void;
  readonly onRetry: () => void;
  readonly onSelect: (id: string) => void;
}

export function ProjectChatList({
  conversations,
  error,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onRetry,
  onSelect,
  status,
}: ProjectChatListProps) {
  if (status === 'loading') {
    return (
      <div aria-busy="true" aria-label="Chargement des chats" className="grid gap-3" role="status">
        {[0, 1, 2].map((id) => (
          <Skeleton className="h-14 w-full rounded-xl" key={id} />
        ))}
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div
        className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
        role="alert"
      >
        <p className="text-destructive">{error ?? 'Impossible de charger les chats.'}</p>
        <Button className="mt-3" onClick={onRetry} size="sm" variant="outline">
          Réessayer
        </Button>
      </div>
    );
  }
  if (conversations.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        Aucun chat pour le moment. Écrivez ci-dessus pour ouvrir le premier.
      </p>
    );
  }
  return (
    <div>
      <ul aria-label="Chats du projet" className="divide-y divide-border">
        {conversations.map((conversation) => (
          <li key={conversation.id}>
            <Button
              className="flex h-auto min-h-14 w-full items-center justify-start gap-3 rounded-lg px-3 py-3 text-left whitespace-normal"
              onClick={() => onSelect(conversation.id)}
              variant="ghost"
            >
              <MessageSquareText
                aria-hidden="true"
                className="shrink-0 text-muted-foreground"
                size={16}
              />
              <span className="min-w-0 flex-1 text-sm font-medium text-foreground wrap-anywhere">
                {conversation.title}
              </span>
              <time
                className="shrink-0 text-2xs font-normal text-muted-foreground"
                dateTime={conversation.createdAt}
              >
                {formatDate(conversation.createdAt)}
              </time>
            </Button>
          </li>
        ))}
      </ul>
      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <Button
            aria-busy={isLoadingMore}
            disabled={isLoadingMore}
            onClick={onLoadMore}
            size="sm"
            variant="outline"
          >
            Charger plus de chats
          </Button>
        </div>
      ) : null}
    </div>
  );
}
