const mockUseQuery = jest.fn();
const mockSearchDocuments = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  useQuery: (...args: any[]) => mockUseQuery(...args),
}));

jest.mock("../../src/services/search", () => ({
  searchDocuments: (...args: any[]) => mockSearchDocuments(...args),
}));

import {
  useSemanticSearch,
  SEARCH_QUERY_KEY,
} from "../../src/hooks/useSemanticSearch";

describe("hooks/useSemanticSearch", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockSearchDocuments.mockReset();
    mockUseQuery.mockReturnValue({ data: null, isLoading: false });
  });

  it("builds expected query key and queryFn payload", async () => {
    useSemanticSearch({ query: "invoice", limit: 12, mode: "hybrid" });

    const options = mockUseQuery.mock.calls[0][0];

    expect(options.queryKey).toEqual([
      SEARCH_QUERY_KEY,
      "invoice",
      12,
      "hybrid",
    ]);
    expect(options.enabled).toBe(true);
    expect(options.staleTime).toBe(30_000);

    mockSearchDocuments.mockResolvedValue({ data: [], meta: { page: 1 } });
    await options.queryFn();

    expect(mockSearchDocuments).toHaveBeenCalledWith({
      q: "invoice",
      limit: 12,
      mode: "hybrid",
    });
  });

  it("disables query for short search text or explicit enabled=false", () => {
    useSemanticSearch({ query: "a" });
    expect(mockUseQuery.mock.calls[0][0].enabled).toBe(false);

    useSemanticSearch({ query: "invoice", enabled: false });
    expect(mockUseQuery.mock.calls[1][0].enabled).toBe(false);
  });
});
