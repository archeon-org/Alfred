import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Text, TouchableOpacity } from "react-native";
import { __getRouter, __resetRouterMocks } from "expo-router";
import PrivacyPolicy from "../../src/app/privacy";
import TermsOfService from "../../src/app/terms";

describe("app legal pages", () => {
  beforeEach(() => {
    __resetRouterMocks();
  });

  it("renders privacy page and handles back navigation", () => {
    const tree = TestRenderer.create(<PrivacyPolicy />);

    const title = tree.root
      .findAllByType(Text)
      .find((node) => node.props.children === "Privacy Policy");
    expect(title).toBeTruthy();

    const backButton = tree.root.findByType(TouchableOpacity);
    act(() => {
      backButton.props.onPress();
    });

    expect(__getRouter().back).toHaveBeenCalledTimes(1);
  });

  it("renders terms page and handles back navigation", () => {
    const tree = TestRenderer.create(<TermsOfService />);

    const title = tree.root
      .findAllByType(Text)
      .find((node) => node.props.children === "Terms of Service");
    expect(title).toBeTruthy();

    const backButton = tree.root.findByType(TouchableOpacity);
    act(() => {
      backButton.props.onPress();
    });

    expect(__getRouter().back).toHaveBeenCalledTimes(1);
  });
});
