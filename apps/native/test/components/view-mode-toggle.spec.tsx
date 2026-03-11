import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { TouchableOpacity } from "react-native";
import { __setColorScheme } from "nativewind";
import { ViewModeToggle } from "../../src/components/common/ViewModeToggle";

describe("components/ViewModeToggle", () => {
  beforeEach(() => {
    __setColorScheme("light");
  });

  it("switches between list and grid modes", () => {
    const onModeChange = jest.fn();

    const tree = TestRenderer.create(
      <ViewModeToggle mode="list" onModeChange={onModeChange} />,
    );

    const buttons = tree.root.findAllByType(TouchableOpacity);

    act(() => {
      buttons[0].props.onPress();
      buttons[1].props.onPress();
    });

    expect(onModeChange).toHaveBeenNthCalledWith(1, "list");
    expect(onModeChange).toHaveBeenNthCalledWith(2, "grid");
  });

  it("supports dark mode rendering path", () => {
    __setColorScheme("dark");

    const tree = TestRenderer.create(
      <ViewModeToggle mode="grid" onModeChange={jest.fn()} />,
    );

    const buttons = tree.root.findAllByType(TouchableOpacity);
    expect(buttons).toHaveLength(2);
  });
});
