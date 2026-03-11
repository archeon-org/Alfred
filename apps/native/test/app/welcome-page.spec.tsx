import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Pressable, Text } from "react-native";
import { __getRouter, __resetRouterMocks } from "expo-router";
import Welcome from "../../src/app/(auth)/welcome";

describe("app/(auth)/welcome", () => {
  beforeEach(() => {
    __resetRouterMocks();
  });

  it("navigates to login, terms, and privacy from CTA/actions", () => {
    const tree = TestRenderer.create(<Welcome />);

    const cta = tree.root.findByType(Pressable);
    act(() => {
      cta.props.onPress();
    });
    expect(__getRouter().push).toHaveBeenCalledWith("/(auth)/login");

    const clickableTexts = tree.root
      .findAllByType(Text)
      .filter((node) => typeof node.props.onPress === "function");

    act(() => {
      clickableTexts[0].props.onPress();
      clickableTexts[1].props.onPress();
    });

    expect(__getRouter().push).toHaveBeenCalledWith("/terms");
    expect(__getRouter().push).toHaveBeenCalledWith("/privacy");
  });
});
