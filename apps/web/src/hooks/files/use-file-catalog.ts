import type { FileKind, FileReadiness } from '@alfred/contracts';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { useDebouncedSearch } from '@/hooks/ui/use-debounced-search';
import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { fileKeys } from '@/hooks/workspace/workspace-keys';
import { toListFilters, type FileFilterState } from '@/lib/files/file-filters';
import { listFiles, type FileListFilters } from '@/services/files/files.service';

/**
 * Cursor pages of the library for one set of filters, newest first. The list is read again when
 * its tab or screen comes back and when the window regains focus; it never polls by itself.
 */
export function useFileList(filters: FileListFilters, enabled = true) {
  const { client, userId } = useWorkspaceAccount();
  const query = useInfiniteQuery({
    queryKey: fileKeys.list(userId, filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => listFiles(client, filters, pageParam, signal),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    // The previous results stay on screen while a new search or filter loads.
    placeholderData: keepPreviousData,
    // Whatever the freshness window: coming back to the tab, the screen or the window reads the
    // library again, since a file may have been analysed or deleted meanwhile.
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    retry: false,
  });
  const { fetchNextPage, isFetching } = query;
  // Any request in flight (a refresh, a new search, a page) blocks the next page: fetching one
  // during a refresh would discard the refreshed result.
  const loadMore = useCallback(() => {
    if (!isFetching) void fetchNextPage({ cancelRefetch: false });
  }, [fetchNextPage, isFetching]);
  const files = [
    ...new Map(
      (query.data?.pages.flatMap((page) => page.items) ?? []).map((file) => [file.id, file]),
    ).values(),
  ];
  return { files, loadMore, query };
}

/** The « Fichiers » tab: the whole library with a debounced search and filters kept in memory. */
export function useFileCatalog(conversationId: string | undefined) {
  const { input, search, setInput } = useDebouncedSearch();
  const [kind, setKind] = useState<FileKind | null>(null);
  const [readiness, setReadiness] = useState<FileReadiness | null>(null);
  const [onlyConversation, setOnlyConversation] = useState(false);
  const filters: FileFilterState = {
    search,
    kind,
    readiness,
    // The filter only exists while a conversation is on screen.
    conversationId: onlyConversation && conversationId !== undefined ? conversationId : null,
  };
  const list = useFileList(toListFilters(filters));
  return {
    ...list,
    filters,
    input,
    setInput,
    setKind,
    setReadiness,
    setOnlyConversation,
    clearFilters: () => {
      setKind(null);
      setReadiness(null);
      setOnlyConversation(false);
    },
  };
}
