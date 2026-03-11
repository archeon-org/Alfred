import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { ActivityIndicator, Pressable, Text } from "react-native";
import { Button } from "../../src/components/Button";
import { shadows } from "../../src/constants/shadows";

describe("components/Button", () => {
  it("renders title and handles press", () => {
    const onPress = jest.fn();

    const tree = TestRenderer.create(
      <Button title="Continue" onPress={onPress} icon={<Text>i</Text>} />,
    );

    const pressable = tree.root.findByType(Pressable);
    expect(pressable.props.accessibilityLabel).toBe("Continue");

    act(() => {
      pressable.props.onPress();
    });

    expect(onPress).toHaveBeenCalledTimes(1);

    const textValues = tree.root
      .findAllByType(Text)
      .map((node) => node.props.children)
      .flat();
    expect(textValues).toContain("i");
    expect(textValues).toContain("Continue");
  });

  it("shows loading spinner and disables interactions", () => {
    const onPress = jest.fn();

    const tree = TestRenderer.create(
      <Button title="Loading" onPress={onPress} isLoading variant="outline" />,
    );

    const pressable = tree.root.findByType(Pressable);
    expect(pressable.props.disabled).toBe(true);
    expect(pressable.props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });

    const spinner = tree.root.findByType(ActivityIndicator);
    expect(spinner.props.color).toBe("#374151");
  });

  it("applies primary and secondary shadow styles", () => {
    const primary = TestRenderer.create(<Button title="Primary" />);
    const primaryPressable = primary.root.findByType(Pressable);
    expect(primaryPressable.props.style).toBe(shadows.primary);

    const secondary = TestRenderer.create(
      <Button title="Secondary" variant="secondary" />,
    );
    const secondaryPressable = secondary.root.findByType(Pressable);
    expect(secondaryPressable.props.style).toBe(shadows.sm);
  });
});
