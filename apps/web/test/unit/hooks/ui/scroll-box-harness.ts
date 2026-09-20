import { afterEach, beforeEach, vi } from 'vitest';

/** A ResizeObserver whose notifications the test sends, since jsdom has no layout. */
export class FakeResizeObserver {
  static last: FakeResizeObserver | undefined;
  readonly observed = new Set<Element>();
  disconnected = false;
  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.last = this;
  }
  observe(target: Element) {
    this.observed.add(target);
  }
  unobserve(target: Element) {
    this.observed.delete(target);
  }
  disconnect() {
    this.observed.clear();
    this.disconnected = true;
  }
  notify(...targets: Element[]) {
    const entries = targets
      .filter((target) => this.observed.has(target))
      .map((target) => ({ target }) as ResizeObserverEntry);
    this.callback(entries, this);
  }
}

export const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
let clock = 0;

/** Runs the pending animation frames `ms` after the previous ones. */
export function runFrame(ms = 16) {
  clock += ms;
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(clock);
}

/** Runs frames until nothing is pending; returns the position after each of them. */
export function settle(box: { top: number }) {
  const tops: number[] = [];
  for (let guard = 0; frames.size > 0 && guard < 200; guard += 1) {
    runFrame();
    tops.push(box.top);
  }
  return tops;
}

/** A scroll container with a stubbed layout: scrollTop clamps like a browser's. */
export function scrollBox(height = 1_000, viewport = 400) {
  const element = document.createElement('div');
  const content = document.createElement('ol');
  element.append(content);
  document.body.append(element);
  const box = { height, viewport, top: 0 };
  const max = () => Math.max(0, box.height - box.viewport);
  Object.defineProperties(element, {
    scrollHeight: { configurable: true, get: () => box.height },
    clientHeight: { configurable: true, get: () => box.viewport },
    scrollTop: {
      configurable: true,
      get: () => box.top,
      set: (value: number) => {
        box.top = Math.min(Math.max(0, value), max());
      },
    },
  });
  const observer = () => FakeResizeObserver.last!;
  return {
    element,
    content,
    box,
    max,
    /** Content grows (or shrinks) and the browser reports it. */
    grow(by: number) {
      box.height += by;
      box.top = Math.min(box.top, max());
      observer().notify(content);
    },
    /** Layout runs without the browser reporting it yet: a shrink clamps the view. */
    reflow(by: number) {
      box.height += by;
      box.top = Math.min(box.top, max());
    },
    /** The DOM of the content changes; the mutation observer hears of it. */
    async mutate() {
      content.append(document.createElement('li'));
      await Promise.resolve();
    },
    /** The person (or the browser) moves the view: a scroll event follows. */
    scrollTo(top: number) {
      box.top = Math.min(Math.max(0, top), max());
      element.dispatchEvent(new Event('scroll'));
    },
    observer,
  };
}

/** Stubs ResizeObserver and animation frames for every test of the file. */
export function installLayoutStubs() {
  beforeEach(() => {
    frames.clear();
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.reducedMotion;
    document.body.replaceChildren();
  });
}
