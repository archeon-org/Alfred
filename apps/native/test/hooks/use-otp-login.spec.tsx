import { act } from "react-test-renderer";
import { renderHook } from "../helpers/renderHook";

const mockRequestOtp = jest.fn();
const mockVerifyOtp = jest.fn();
const mockSignIn = jest.fn();
const mockShowError = jest.fn();
const mockParseApiError = jest.fn();
const mockUseForm = jest.fn();

jest.mock("../../src/services", () => ({
  requestOtp: (...args: any[]) => mockRequestOtp(...args),
  verifyOtp: (...args: any[]) => mockVerifyOtp(...args),
}));

jest.mock("../../src/context/AuthContext", () => ({
  useAuth: () => ({ signIn: mockSignIn }),
}));

jest.mock("../../src/context/ToastContext", () => ({
  useToast: () => ({ error: mockShowError }),
}));

jest.mock("../../src/utils/apiError", () => ({
  parseApiError: (...args: any[]) => mockParseApiError(...args),
}));

jest.mock("react-hook-form", () => ({
  useForm: (...args: any[]) => mockUseForm(...args),
}));

import { __getRouter } from "expo-router";
import { useOtpLogin } from "../../src/hooks/useOtpLogin";

describe("hooks/useOtpLogin", () => {
  const formValues: Record<string, string> = {
    email: "user@example.com",
    otp: "123456",
  };

  const trigger = jest.fn();
  const getValues = jest.fn((field?: string) =>
    field ? formValues[field] : { ...formValues },
  );
  const setValue = jest.fn((field: string, value: string) => {
    formValues[field] = value;
  });

  beforeEach(() => {
    mockRequestOtp.mockReset();
    mockVerifyOtp.mockReset();
    mockSignIn.mockReset();
    mockShowError.mockReset();
    mockParseApiError.mockReset();

    trigger.mockReset();
    getValues.mockClear();
    setValue.mockClear();

    formValues.email = "user@example.com";
    formValues.otp = "123456";

    mockUseForm.mockReturnValue({
      control: {},
      handleSubmit: jest.fn(),
      trigger,
      getValues,
      setValue,
      formState: { errors: {} },
    });

    mockParseApiError.mockReturnValue({ message: "Something went wrong" });
  });

  it("requests OTP and transitions to otp step on success", async () => {
    trigger.mockResolvedValue(true);
    mockRequestOtp.mockResolvedValue(undefined);

    const { result } = renderHook(() => useOtpLogin());

    expect(result.current.step).toBe("email");
    expect(result.current.router).toBe(__getRouter());

    await act(async () => {
      await result.current.handleRequestOtp();
    });

    expect(mockRequestOtp).toHaveBeenCalledWith("user@example.com");
    expect(result.current.step).toBe("otp");
    expect(result.current.email).toBe("user@example.com");
  });

  it("shows request error toast when OTP request fails", async () => {
    trigger.mockResolvedValue(true);
    mockRequestOtp.mockRejectedValue(new Error("api down"));

    const { result } = renderHook(() => useOtpLogin());

    await act(async () => {
      await result.current.handleRequestOtp();
    });

    expect(mockShowError).toHaveBeenCalledWith(
      "Request Failed",
      "Something went wrong",
    );
    expect(result.current.step).toBe("email");
  });

  it("verifies OTP and signs in user", async () => {
    trigger.mockResolvedValue(true);
    mockRequestOtp.mockResolvedValue(undefined);
    mockVerifyOtp.mockResolvedValue({ accessToken: "token-123" });

    const { result } = renderHook(() => useOtpLogin());

    await act(async () => {
      await result.current.handleRequestOtp();
    });

    await act(async () => {
      await result.current.handleVerifyOtp();
    });

    expect(mockVerifyOtp).toHaveBeenCalledWith("user@example.com", "123456");
    expect(mockSignIn).toHaveBeenCalledWith("token-123");
  });

  it("resets state to initial email step", async () => {
    trigger.mockResolvedValue(true);
    mockRequestOtp.mockResolvedValue(undefined);

    const { result } = renderHook(() => useOtpLogin());

    await act(async () => {
      await result.current.handleRequestOtp();
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.step).toBe("email");
    expect(setValue).toHaveBeenCalledWith("otp", "");
    expect(result.current.email).toBe("user@example.com");
  });
});
