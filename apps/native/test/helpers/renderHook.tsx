import React from "react";
import TestRenderer, { act } from "react-test-renderer";

export type RenderHookResult<T> = {
  result: { current: T };
  rerender: () => void;
  unmount: () => void;
};

export function renderHook<T>(
  hook: () => T,
  Wrapper?: React.ComponentType<{ children: React.ReactNode }>,
): RenderHookResult<T> {
  const result = { current: undefined as unknown as T };

  const HookProbe = () => {
    result.current = hook();
    return null;
  };

  const Content = Wrapper ? (
    <Wrapper>
      <HookProbe />
    </Wrapper>
  ) : (
    <HookProbe />
  );

  const renderer = TestRenderer.create(Content);

  return {
    result,
    rerender: () => {
      act(() => {
        renderer.update(Content);
      });
    },
    unmount: () => {
      act(() => {
        renderer.unmount();
      });
    },
  };
}

export const flushPromises = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};
