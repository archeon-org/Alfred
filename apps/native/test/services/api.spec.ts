const mockGetItemAsync = jest.fn();
const mockDeleteItemAsync = jest.fn();
const mockParseApiError = jest.fn();

jest.mock("expo-secure-store", () => ({
  getItemAsync: (...args: any[]) => mockGetItemAsync(...args),
  deleteItemAsync: (...args: any[]) => mockDeleteItemAsync(...args),
}));

jest.mock("../../src/constants/Config", () => ({
  __esModule: true,
  default: {
    API_URL: "https://native.test/api",
  },
}));

jest.mock("../../src/utils/apiError", () => ({
  parseApiError: (...args: any[]) => mockParseApiError(...args),
}));

import api from "../../src/services/api";

describe("services/api", () => {
  beforeEach(() => {
    mockGetItemAsync.mockReset();
    mockDeleteItemAsync.mockReset();
    mockParseApiError.mockReset();
  });

  it("creates an axios instance with expected base config", () => {
    expect(api.defaults.baseURL).toBe("https://native.test/api");
    expect((api.defaults.headers as any)["Content-Type"]).toBe(
      "application/json",
    );
    expect(api).toBeDefined();
  });

  it("adds auth header in request interceptor when token exists", async () => {
    mockGetItemAsync.mockResolvedValue("token-123");
    const requestInterceptor = (api.interceptors.request as any).handlers[0]
      .fulfilled;
    const config = { headers: {} as Record<string, string> };

    const result = await requestInterceptor(config);

    expect(mockGetItemAsync).toHaveBeenCalledWith("auth_token");
    expect(result.headers.Authorization).toBe("Bearer token-123");
  });

  it("does not set auth header when token is missing", async () => {
    mockGetItemAsync.mockResolvedValue(null);
    const requestInterceptor = (api.interceptors.request as any).handlers[0]
      .fulfilled;
    const config = { headers: {} as Record<string, string> };

    const result = await requestInterceptor(config);

    expect(result.headers.Authorization).toBeUndefined();
  });

  it("clears token on 401 and rejects with AppError", async () => {
    const appError = { statusCode: 401, message: "Unauthorized" };
    mockParseApiError.mockReturnValue(appError);
    const responseErrorInterceptor = (api.interceptors.response as any)
      .handlers[0].rejected;

    await expect(responseErrorInterceptor(new Error("raw"))).rejects.toBe(
      appError,
    );
    expect(mockDeleteItemAsync).toHaveBeenCalledWith("auth_token");
  });

  it("does not clear token for non-401 errors", async () => {
    const appError = { statusCode: 500, message: "Server down" };
    mockParseApiError.mockReturnValue(appError);
    const responseErrorInterceptor = (api.interceptors.response as any)
      .handlers[0].rejected;

    await expect(responseErrorInterceptor(new Error("raw"))).rejects.toBe(
      appError,
    );
    expect(mockDeleteItemAsync).not.toHaveBeenCalled();
  });
});
