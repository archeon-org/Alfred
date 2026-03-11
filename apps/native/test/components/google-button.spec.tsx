import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { ActivityIndicator, Text, TouchableOpacity } from "react-native";
import { GoogleButton } from "../../src/components/GoogleButton";

describe("components/GoogleButton", () => {
  it("triggers onPress when enabled", () => {
    const onPress = jest.fn();
    const tree = TestRenderer.create(
      <GoogleButton onPress={onPress} title="Sign in" />,
    );

    const touchable = tree.root.findByType(TouchableOpacity);
    act(() => {
      touchable.props.onPress();
    });

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(tree.root.findByType(Text).props.children).toBe("Sign in");
  });

  it("renders loading indicator and disables touch", () => {
    const tree = TestRenderer.create(
      <GoogleButton onPress={jest.fn()} isLoading />,
    );

    const touchable = tree.root.findByType(TouchableOpacity);
    expect(touchable.props.disabled).toBe(true);

    const indicator = tree.root.findByType(ActivityIndicator);
    expect(indicator.props.color).toBe("#6366F1");
  });
});
