import { act } from '@testing-library/react';
import { vi } from 'vitest';

/** Layout-free observer driver; each notification invokes the real production callback. */
export function installIntersectionObserver() {
  const observers = new Map<Element, IntersectionObserverCallback>();
  class Observer {
    constructor(private readonly callback: IntersectionObserverCallback) {}
    observe(target: Element) {
      observers.set(target, this.callback);
    }
    disconnect() {
      for (const [target, callback] of observers)
        if (callback === this.callback) observers.delete(target);
    }
    unobserve(target: Element) {
      observers.delete(target);
    }
  }
  vi.stubGlobal('IntersectionObserver', Observer);
  return {
    intersect(target: Element) {
      act(() =>
        observers.get(target)?.(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        ),
      );
    },
  };
}
