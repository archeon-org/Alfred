import { describe, expect, it, vi } from 'vitest';

import { followBottom } from '@/hooks/ui/use-stick-to-bottom';

import { frames, runFrame, scrollBox, settle, installLayoutStubs } from './scroll-box-harness';

installLayoutStubs();

/** A container pinned to the bottom of a long transcript. */
function pinned(height = 3_000) {
  const view = scrollBox(height);
  const follower = followBottom(view.element);
  view.observer().notify(view.element);
  expect(view.box.top).toBe(view.max());
  return { view, follower };
}

describe('followBottom: content shrinking under the pinned view', () => {
  it('keeps following when layout clamps the view before more content arrives in the same frame', async () => {
    const { view, follower } = pinned();
    // A disclosure folds, a script reads layout (the view clamps 300 px up), then tokens arrive;
    // the browser reports the clamp afterwards, with the taller content.
    await view.mutate();
    view.reflow(-300);
    view.reflow(500);
    view.element.dispatchEvent(new Event('scroll'));
    expect(follower.following).toBe(true);
    expect(view.element.style.overflowAnchor).toBe('none');
    expect(settle(view.box).at(-1)).toBe(view.max());
  });

  it('keeps following when the resize observer saw the clamp before its scroll event', () => {
    const { view, follower } = pinned();
    // Layout of a frame clamps the view and reports the smaller content; its scroll event comes a
    // frame later, after the next tokens and with no content change left in that frame.
    view.grow(-400);
    runFrame();
    view.reflow(250);
    view.element.dispatchEvent(new Event('scroll'));
    expect(follower.following).toBe(true);
    view.observer().notify(view.content);
    expect(settle(view.box).at(-1)).toBe(view.max());
  });

  it('still lets the person scroll away while content changes', async () => {
    let now = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { view, follower } = pinned();
    const away = () => view.scrollTo(view.box.top - 300);

    // Focus moved by the keyboard: the browser reveals the focused element.
    await view.mutate();
    view.element.dispatchEvent(new FocusEvent('focusin'));
    away();
    expect(follower.following).toBe(false);

    // A pointer pressed on the scrollbar or the text.
    now += 1_000;
    follower.jump();
    await view.mutate();
    view.element.dispatchEvent(new Event('pointerdown'));
    away();
    expect(follower.following).toBe(false);
    // A drag whose release is not reported ends with the next move without buttons.
    window.dispatchEvent(new MouseEvent('pointermove', { buttons: 0 }));
    follower.jump();
    await view.mutate();
    view.reflow(-200);
    view.element.dispatchEvent(new Event('scroll'));
    expect(follower.following).toBe(true);

    // A finger on the view.
    await view.mutate();
    view.element.dispatchEvent(new Event('touchstart'));
    away();
    expect(follower.following).toBe(false);
    window.dispatchEvent(new Event('touchend'));

    // With no content change in the frame, a scroll up without input is the person's too.
    follower.jump();
    settle(view.box);
    away();
    expect(follower.following).toBe(false);
  });

  it('does not take a click that focuses a disclosure for keyboard focus', async () => {
    const { view, follower } = pinned();
    view.element.dispatchEvent(new Event('pointerdown'));
    view.element.dispatchEvent(new FocusEvent('focusin'));
    window.dispatchEvent(new Event('pointerup'));
    // The click folds the disclosure: the view clamps while the next tokens arrive.
    await view.mutate();
    view.reflow(-250);
    view.reflow(100);
    view.element.dispatchEvent(new Event('scroll'));
    expect(follower.following).toBe(true);
  });
});

describe('followBottom: keys and pixels', () => {
  it('lets the scrolling keys pressed on a focused ancestor scroll the container', () => {
    const { view, follower } = pinned();
    const main = document.createElement('main');
    main.tabIndex = -1;
    document.body.append(main);
    main.append(view.element);
    view.element.tabIndex = -1;
    const press = (target: HTMLElement, init: KeyboardEventInit) => {
      target.focus();
      target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
    };

    press(main, { key: 'PageDown' });
    expect(document.activeElement).toBe(view.element);
    expect(follower.following).toBe(true);
    press(main, { key: 'PageUp' });
    expect(document.activeElement).toBe(view.element);
    expect(follower.following).toBe(false);

    // Shortcuts, other keys and elements beside the container keep their focus.
    follower.jump();
    const beside = document.createElement('button');
    document.body.append(beside);
    press(beside, { key: 'PageUp' });
    press(main, { key: 'ArrowUp', metaKey: true });
    press(main, { key: 'a' });
    expect(document.activeElement).toBe(main);
    expect(follower.following).toBe(true);
    follower.dispose();
    press(main, { key: 'PageUp' });
    expect(document.activeElement).toBe(main);
  });

  it('advances in whole pixels, so engines that truncate positions do not crawl to the bottom', () => {
    const { view } = pinned(1_000);
    Object.defineProperty(view.element, 'scrollTop', {
      configurable: true,
      get: () => view.box.top,
      set: (value: number) => {
        view.box.top = Math.min(Math.max(0, Math.trunc(value)), view.max());
      },
    });
    view.grow(23);
    expect(frames.size).toBe(1);
    const tops = settle(view.box);
    expect(tops.every((top) => Number.isInteger(top))).toBe(true);
    expect(tops.length).toBeLessThanOrEqual(7);
    expect(view.box.top).toBe(view.max());
  });
});
