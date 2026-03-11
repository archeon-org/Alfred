import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { TouchableOpacity } from "react-native";

const mockUseOtpLogin = jest.fn();

jest.mock("../../src/components/Button", () => {
  const React = require("react");
  return {
    Button: (props: any) => React.createElement("OtpButton", props),
  };
});

jest.mock("../../src/components/ControlledInput", () => {
  const React = require("react");
  return {
    ControlledInput: (props: any) =>
      React.createElement("ControlledInput", props),
  };
});

jest.mock("../../src/hooks/useOtpLogin", () => ({
  useOtpLogin: () => mockUseOtpLogin(),
}));

import OtpLogin from "../../src/app/(auth)/otp";

describe("app/(auth)/otp", () => {
  const router = {
    back: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  };

  const baseHook = {
    control: {},
    step: "email",
    isLoading: false,
    handleRequestOtp: jest.fn(),
    handleVerifyOtp: jest.fn(),
    reset: jest.fn(),
    router,
    email: "user@example.com",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseOtpLogin.mockReset();
  });

  it("renders email step and requests code", () => {
    mockUseOtpLogin.mockReturnValue(baseHook);

    const tree = TestRenderer.create(<OtpLogin />);

    const button = tree.root.findByType("OtpButton");
    act(() => {
      button.props.onPress();
    });

    expect(baseHook.handleRequestOtp).toHaveBeenCalledTimes(1);

    const backButton = tree.root.findByType(TouchableOpacity);
    act(() => {
      backButton.props.onPress();
    });

    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("renders otp step and supports verify + reset", () => {
    mockUseOtpLogin.mockReturnValue({
      ...baseHook,
      step: "otp",
    });

    const tree = TestRenderer.create(<OtpLogin />);

    const button = tree.root.findByType("OtpButton");
    act(() => {
      button.props.onPress();
    });

    expect(baseHook.handleVerifyOtp).toHaveBeenCalledTimes(1);

    const touchables = tree.root.findAllByType(TouchableOpacity);
    const resetAction = touchables[touchables.length - 1];

    act(() => {
      resetAction.props.onPress();
    });

    expect(baseHook.reset).toHaveBeenCalledTimes(1);
  });
});
