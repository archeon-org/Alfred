import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import {
  searchDocuments,
  SearchResponse,
  SearchParams,
} from "../services/search";

export const SEARCH_QUERY_KEY = "semantic-search";

/**
 * Hook for semantic document search
 * Enables natural language search across user's documents
 *
 * @example
 * const { data, isLoading } = useSemanticSearch({
 *   query: "electricity bill from last month",
 *   enabled: searchQuery.length >= 2
 * });
 */
export function useSemanticSearch(
  params: {
    query: string;
    limit?: number;
    mode?: "semantic" | "hybrid";
    enabled?: boolean;
  },
  options?: Omit<UseQueryOptions<SearchResponse, Error>, "queryKey" | "queryFn">
) {
  return useQuery<SearchResponse, Error>({
    queryKey: [SEARCH_QUERY_KEY, params.query, params.limit, params.mode],
    queryFn: () =>
      searchDocuments({
        q: params.query,
        limit: params.limit,
        mode: params.mode,
      }),
    enabled: params.enabled !== false && params.query.length >= 2,
    staleTime: 30 * 1000, // Results stay fresh for 30 seconds
    placeholderData: (previousData) => previousData, // Keep previous data while loading new
    ...options,
  });
}
