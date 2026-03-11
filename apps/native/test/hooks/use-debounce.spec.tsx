import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { useDebounce } from "../../src/hooks/useDebounce";

describe("hooks/useDebounce", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("debounces value updates until delay expires", () => {
    let observed = "";

    const Probe = ({ value, delay }: { value: string; delay: number }) => {
      observed = useDebounce(value, delay);
      return null;
    };

    const view = TestRenderer.create(<Probe value="a" delay={200} />);

    expect(observed).toBe("a");

    act(() => {
      view.update(<Probe value="ab" delay={200} />);
    });

    expect(observed).toBe("a");

    act(() => {
      jest.advanceTimersByTime(199);
    });
    expect(observed).toBe("a");

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(observed).toBe("ab");
  });

  it("clears previous timer when value changes quickly", () => {
    let observed = "";

    const Probe = ({ value }: { value: string }) => {
      observed = useDebounce(value, 300);
      return null;
    };

    const view = TestRenderer.create(<Probe value="first" />);

    act(() => {
      view.update(<Probe value="second" />);
    });

    act(() => {
      jest.advanceTimersByTime(150);
    });

    act(() => {
      view.update(<Probe value="third" />);
    });

    act(() => {
      jest.advanceTimersByTime(299);
    });
    expect(observed).toBe("first");

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(observed).toBe("third");
  });
});
