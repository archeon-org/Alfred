import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Animated } from "react-native";
import { Skeleton } from "../../src/components/common/Skeleton";

describe("components/Skeleton", () => {
  it("starts animation on mount and stops on unmount", () => {
    const start = jest.fn();
    const stop = jest.fn();

    const loopSpy = jest
      .spyOn(Animated, "loop")
      .mockReturnValue({ start, stop } as any);

    let tree: TestRenderer.ReactTestRenderer;

    act(() => {
      tree = TestRenderer.create(<Skeleton className="h-4 w-10" />);
    });

    expect(start).toHaveBeenCalledTimes(1);

    act(() => {
      (tree as TestRenderer.ReactTestRenderer).unmount();
    });

    expect(stop).toHaveBeenCalledTimes(1);
    loopSpy.mockRestore();
  });
});
