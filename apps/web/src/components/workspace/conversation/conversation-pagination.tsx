import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useInfiniteScroll } from '@/hooks/ui/use-infinite-scroll';

export interface ConversationPaginationProps {
  readonly hasMore: boolean;
  readonly isLoadingMore: boolean;
  readonly error: string | null;
  readonly onLoadMore: () => void;
  readonly onRetry: () => void;
  readonly paused?: boolean;
}

export function ConversationListSkeleton() {
  return (
    <div role="status" aria-label="Chargement des conversations" className="space-y-2 py-2">
      {[0, 1, 2].map((id) => (
        <Skeleton key={id} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  );
}

/** Normal paging is automatic. Only a failed request exposes an explicit retry action. */
export function ConversationPagination({
  hasMore,
  isLoadingMore,
  error,
  onLoadMore,
  onRetry,
  paused = false,
}: ConversationPaginationProps) {
  const enabled = hasMore && !isLoadingMore && !error && !paused;
  const sentinel = useInfiniteScroll(Boolean(enabled), onLoadMore);
  return (
    <>
      {isLoadingMore ? <ConversationListSkeleton /> : null}
      {error ? (
        <div role="alert" className="my-3 space-y-2 text-xs text-muted-foreground">
          <p>{error}</p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Réessayer le chargement des conversations
          </Button>
        </div>
      ) : null}
      {hasMore && !error && !paused ? (
        <div
          ref={sentinel}
          data-testid="conversation-scroll-sentinel"
          aria-hidden="true"
          className="h-px"
        />
      ) : null}
    </>
  );
}
