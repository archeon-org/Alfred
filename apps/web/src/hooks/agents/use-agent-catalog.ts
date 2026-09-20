import { keepPreviousData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useDebouncedSearch } from '@/hooks/ui/use-debounced-search';
import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { listAgents } from '@/services/agents/agents.service';
import { ApiRequestError } from '@/services/http/api-json';

/** The searchable, paged specialist list; the search reaches the API only once typing settles. */
export function useAgentCatalog() {
  const { client, userId } = useWorkspaceAccount();
  const cache = useQueryClient();
  const { input, search, setInput } = useDebouncedSearch();
  const query = useInfiniteQuery({
    queryKey: ['agents', userId, search],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listAgents(client, pageParam, search),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // The previous results stay on screen while a new search loads.
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const catalogChanged =
    query.error instanceof ApiRequestError && query.error.code === 'agent_catalog_changed';
  useEffect(() => {
    // The pages already shown belong to an older catalog: read the new one from the start.
    if (catalogChanged)
      void cache.resetQueries({ queryKey: ['agents', userId, search], exact: true });
  }, [cache, catalogChanged, userId, search]);
  return {
    query,
    input,
    search,
    setInput,
    agents: query.data?.pages.flatMap((page) => page.items) ?? [],
  };
}
