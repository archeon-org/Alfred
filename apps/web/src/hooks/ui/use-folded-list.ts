import { useState } from 'react';

interface FoldedListOptions {
  /** More items exist beyond the ones already loaded. */
  readonly hasMore?: boolean;
  readonly onLoadMore?: () => void;
}

/**
 * A list that shows its first `pageSize` items until "show more" reveals what is loaded (fetching
 * the next page when everything loaded is already visible) and "show less" folds it back without
 * refetching. Reusable for any sidebar section.
 */
export function useFoldedList<T>(
  items: readonly T[],
  pageSize: number,
  { hasMore = false, onLoadMore }: FoldedListOptions = {},
) {
  const [showAll, setShowAll] = useState(false);
  const beyondFirstPage = items.length > pageSize;
  return {
    canShowLess: showAll && beyondFirstPage,
    canShowMore: showAll ? hasMore : beyondFirstPage || hasMore,
    showLess: () => setShowAll(false),
    showMore: () => {
      if (showAll || !beyondFirstPage) onLoadMore?.();
      setShowAll(true);
    },
    visible: showAll ? items : items.slice(0, pageSize),
  };
}
