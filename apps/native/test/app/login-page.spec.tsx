import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Text, TouchableOpacity } from "react-native";

const mockUseGoogleLogin = jest.fn();

jest.mock("../../src/components/GoogleButton", () => {
  const React = require("react");
  return {
    GoogleButton: (props: any) => React.createElement("GoogleButton", props),
  };
});

jest.mock("../../src/components/Button", () => {
  const React = require("react");
  return {
    Button: (props: any) => React.createElement("AppButton", props),
  };
});

jest.mock("../../src/hooks/useGoogleLogin", () => ({
  useGoogleLogin: () => mockUseGoogleLogin(),
}));

import { __getRouter, __resetRouterMocks } from "expo-router";
import { __setPlatformOS } from "react-native";
import { __setAppOwnership } from "expo-constants";
import Login from "../../src/app/(auth)/login";

describe("app/(auth)/login", () => {
  beforeEach(() => {
    __resetRouterMocks();
    mockUseGoogleLogin.mockReset();
    mockUseGoogleLogin.mockReturnValue({
      promptAsync: jest.fn(),
      request: { clientId: "google-client" },
      isLoading: false,
    });
  });

  it("shows email fallback on android and handles login actions", () => {
    __setPlatformOS("android");
    __setAppOwnership("standalone");

    const tree = TestRenderer.create(<Login />);

    const googleButton = tree.root.findByType("GoogleButton");
    act(() => {
      googleButton.props.onPress();
    });

    expect(
      mockUseGoogleLogin.mock.results[0].value.promptAsync,
    ).toHaveBeenCalledTimes(1);

    const emailButton = tree.root.findByType("AppButton");
    act(() => {
      emailButton.props.onPress();
    });

    expect(__getRouter().push).toHaveBeenCalledWith("/(auth)/otp");

    const backButton = tree.root.findByType(TouchableOpacity);
    act(() => {
      backButton.props.onPress();
    });

    expect(__getRouter().back).toHaveBeenCalledTimes(1);
  });

  it("hides email fallback on iOS standalone", () => {
    __setPlatformOS("ios");
    __setAppOwnership("standalone");

    const tree = TestRenderer.create(<Login />);

    expect(tree.root.findAllByType("AppButton")).toHaveLength(0);
  });

  it("shows email fallback on iOS when running in Expo Go", () => {
    __setPlatformOS("ios");
    __setAppOwnership("expo");

    const tree = TestRenderer.create(<Login />);

    expect(tree.root.findAllByType("AppButton")).toHaveLength(1);

    const legalLinks = tree.root
      .findAllByType(Text)
      .filter((node) => typeof node.props.onPress === "function");

    act(() => {
      legalLinks[0].props.onPress();
      legalLinks[1].props.onPress();
    });

    expect(__getRouter().push).toHaveBeenCalledWith("/terms");
    expect(__getRouter().push).toHaveBeenCalledWith("/privacy");
  });
});
