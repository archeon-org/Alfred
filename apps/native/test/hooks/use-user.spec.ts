const mockUseQuery = jest.fn();
const mockUseMutation = jest.fn();
const mockUseQueryClient = jest.fn();
const mockGetProfile = jest.fn();
const mockUpdateUser = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  useQuery: (...args: any[]) => mockUseQuery(...args),
  useMutation: (...args: any[]) => mockUseMutation(...args),
  useQueryClient: (...args: any[]) => mockUseQueryClient(...args),
}));

jest.mock("../../src/services", () => ({
  getProfile: (...args: any[]) => mockGetProfile(...args),
  updateUser: (...args: any[]) => mockUpdateUser(...args),
}));

import { mergePreferences } from "@archeon-org/types";
import {
  USER_QUERY_KEY,
  useUpdateUser,
  useUser,
} from "../../src/hooks/useUser";

describe("hooks/useUser", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockUseMutation.mockReset();
    mockUseQueryClient.mockReset();
    mockGetProfile.mockReset();
    mockUpdateUser.mockReset();
  });

  it("configures profile query with stable key", async () => {
    mockUseQuery.mockReturnValue({ data: null });

    useUser();

    const options = mockUseQuery.mock.calls[0][0];
    expect(options.queryKey).toEqual(USER_QUERY_KEY);

    mockGetProfile.mockResolvedValue({ id: "user-1" });
    await options.queryFn();
    expect(mockGetProfile).toHaveBeenCalledTimes(1);
  });

  it("applies optimistic update, rollback and invalidation", async () => {
    const previousUser = {
      id: "user-1",
      firstName: "Old",
      preferences: { theme: "light", compactMode: false },
    };

    const queryClient = {
      cancelQueries: jest.fn(async () => {}),
      getQueryData: jest.fn(() => previousUser),
      setQueryData: jest.fn(),
      invalidateQueries: jest.fn(),
    };

    let mutationConfig: any;

    mockUseQueryClient.mockReturnValue(queryClient);
    mockUseMutation.mockImplementation((config) => {
      mutationConfig = config;
      return { mutateAsync: jest.fn() };
    });

    useUpdateUser();

    const payload = {
      firstName: "New",
      preferences: { compactMode: true },
    };

    const context = await mutationConfig.onMutate(payload);

    expect(queryClient.cancelQueries).toHaveBeenCalledWith({
      queryKey: USER_QUERY_KEY,
    });

    const expectedPreferences = mergePreferences(
      previousUser.preferences as any,
      payload.preferences as any,
    );

    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      USER_QUERY_KEY,
      expect.objectContaining({
        firstName: "New",
        preferences: expectedPreferences,
      }),
    );
    expect(context).toEqual({ previousUser });

    mutationConfig.onError(new Error("failed"), payload, context);
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      USER_QUERY_KEY,
      previousUser,
    );

    mutationConfig.onSettled();
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: USER_QUERY_KEY,
    });
  });
});
