import { act } from "react-test-renderer";
import { renderHook } from "../helpers/renderHook";

const mockGetTemplates = jest.fn();
const mockApplyTemplate = jest.fn();
const mockGetTemplateCategories = jest.fn();
const mockRefreshUser = jest.fn();

const mockUseInfiniteQuery = jest.fn();
const mockUseMutation = jest.fn();
const mockUseQueryClient = jest.fn();

jest.mock("../../src/services", () => ({
  getTemplates: (...args: any[]) => mockGetTemplates(...args),
  applyTemplate: (...args: any[]) => mockApplyTemplate(...args),
  getTemplateCategories: (...args: any[]) => mockGetTemplateCategories(...args),
}));

jest.mock("../../src/context/AuthContext", () => ({
  useAuth: () => ({ refreshUser: mockRefreshUser }),
}));

jest.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: (...args: any[]) => mockUseInfiniteQuery(...args),
  useMutation: (...args: any[]) => mockUseMutation(...args),
  useQueryClient: (...args: any[]) => mockUseQueryClient(...args),
}));

import { useOnboarding } from "../../src/hooks/useOnboarding";

describe("hooks/useOnboarding", () => {
  beforeEach(() => {
    jest.useFakeTimers();

    mockGetTemplates.mockReset();
    mockApplyTemplate.mockReset();
    mockGetTemplateCategories.mockReset();
    mockRefreshUser.mockReset();

    mockUseInfiniteQuery.mockReset();
    mockUseMutation.mockReset();
    mockUseQueryClient.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("exposes templates/categories and handles apply flow", async () => {
    const templatesQuery = {
      data: {
        pages: [
          {
            data: [{ id: "tpl-1" }, { id: "tpl-2" }],
            meta: { currentPage: 1, totalPages: 1 },
          },
        ],
      },
      isLoading: false,
      isError: false,
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      refetch: jest.fn(),
    };

    const categoriesQuery = {
      data: {
        pages: [
          {
            data: [{ id: "cat-1" }],
            meta: { currentPage: 1, totalPages: 1 },
          },
        ],
      },
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
    };

    mockUseInfiniteQuery.mockImplementation(({ queryKey }) => {
      if (queryKey[0] === "templates") return templatesQuery;
      return categoriesQuery;
    });

    const invalidateQueries = jest.fn();
    mockUseQueryClient.mockReturnValue({ invalidateQueries });

    mockApplyTemplate.mockResolvedValue(undefined);

    mockUseMutation.mockImplementation(
      ({ mutationFn, onSuccess, onError }) => ({
        isPending: false,
        mutateAsync: async (templateId: string) => {
          try {
            const response = await mutationFn(templateId);
            await onSuccess?.(response, templateId, undefined);
            return response;
          } catch (error) {
            onError?.(error, templateId, undefined);
            throw error;
          }
        },
      }),
    );

    const { result } = renderHook(() => useOnboarding());

    expect(result.current.templates).toEqual([
      { id: "tpl-1" },
      { id: "tpl-2" },
    ]);
    expect(result.current.templateCategories).toEqual([{ id: "cat-1" }]);

    act(() => {
      result.current.handleSelectTemplate("tpl-1");
    });

    await act(async () => {
      await result.current.handleApplyTemplate();
    });

    expect(mockApplyTemplate).toHaveBeenCalledWith("tpl-1");
    expect(result.current.showBiometricSetup).toBe(true);

    await act(async () => {
      await result.current.handleBiometricSetupComplete();
    });

    expect(result.current.showBiometricSetup).toBe(false);
    expect(mockRefreshUser).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["templates"] });
  });

  it("debounces search input and configures pagination resolvers", () => {
    const templatesQuery = {
      data: { pages: [] },
      isLoading: false,
      isError: false,
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      refetch: jest.fn(),
    };

    const categoriesQuery = {
      data: { pages: [] },
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
    };

    mockUseInfiniteQuery.mockImplementation(({ queryKey }) => {
      if (queryKey[0] === "templates") return templatesQuery;
      return categoriesQuery;
    });

    mockUseQueryClient.mockReturnValue({ invalidateQueries: jest.fn() });
    mockUseMutation.mockReturnValue({
      isPending: false,
      mutateAsync: jest.fn(),
    });

    const { result } = renderHook(() => useOnboarding());

    act(() => {
      result.current.handleSearch("invoice");
    });

    expect(result.current.searchQuery).toBe("invoice");

    act(() => {
      jest.advanceTimersByTime(500);
    });

    const templateCall = mockUseInfiniteQuery.mock.calls.find(
      (call) => call[0].queryKey[0] === "templates",
    )?.[0];
    const categoryCall = mockUseInfiniteQuery.mock.calls.find(
      (call) => call[0].queryKey[0] === "template-categories",
    )?.[0];

    expect(
      templateCall.getNextPageParam({
        meta: { currentPage: 1, totalPages: 3 },
      }),
    ).toBe(2);
    expect(
      templateCall.getNextPageParam({
        meta: { currentPage: 3, totalPages: 3 },
      }),
    ).toBeUndefined();

    expect(categoryCall.enabled).toBe(false);
    expect(
      categoryCall.getNextPageParam({
        meta: { currentPage: 1, totalPages: 1 },
      }),
    ).toBeUndefined();
  });
});
