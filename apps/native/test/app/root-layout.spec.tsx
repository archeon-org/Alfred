import React from "react";
import TestRenderer from "react-test-renderer";

jest.mock("../../src/context/AuthContext", () => {
  const React = require("react");
  return {
    AuthProvider: ({ children }: any) =>
      React.createElement("AuthProvider", null, children),
  };
});

jest.mock("../../src/context/BiometricContext", () => {
  const React = require("react");
  return {
    BiometricProvider: ({ children }: any) =>
      React.createElement("BiometricProvider", null, children),
  };
});

jest.mock("../../src/context/ToastContext", () => {
  const React = require("react");
  return {
    ToastProvider: ({ children }: any) =>
      React.createElement("ToastProvider", null, children),
  };
});

jest.mock("../../src/components/BiometricLockScreen", () => {
  const React = require("react");
  return {
    BiometricLockScreen: () => React.createElement("BiometricLockScreen"),
  };
});

jest.mock("@react-navigation/native", () => {
  const React = require("react");
  return {
    ThemeProvider: ({ children }: any) =>
      React.createElement("ThemeProvider", null, children),
    DefaultTheme: { dark: false },
    DarkTheme: { dark: true },
  };
});

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light" }),
}));

import RootLayout from "../../src/app/_layout";

describe("app/_layout", () => {
  it("declares root stack screens", () => {
    const tree = TestRenderer.create(<RootLayout />);

    const screens = tree.root.findAllByType("StackScreen");
    expect(screens.map((screen) => screen.props.name)).toEqual([
      "(app)",
      "notifications",
      "terms",
      "privacy",
    ]);

    expect(tree.root.findAllByType("BiometricLockScreen")).toHaveLength(1);
  });
});
