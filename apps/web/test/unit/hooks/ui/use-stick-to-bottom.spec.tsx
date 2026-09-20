import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { followBottom, useStickToBottom } from '@/hooks/ui/use-stick-to-bottom';

import {
  FakeResizeObserver,
  frames,
  runFrame,
  scrollBox,
  settle,
  installLayoutStubs,
} from './scroll-box-harness';

installLayoutStubs();

describe('followBottom', () => {
  it('lands on the bottom at once when its container is first laid out', () => {
    const view = scrollBox();
    followBottom(view.element);
    view.observer().notify(view.element, view.content);
    expect(view.box.top).toBe(600);
    expect(frames.size).toBe(0);
  });

  it('eases toward a bottom that keeps moving while content grows', () => {
    const view = scrollBox();
    followBottom(view.element);
    view.observer().notify(view.element);
    view.grow(500);
    // Growth never jumps: one frame at a time, starting from where the view was.
    expect(view.box.top).toBe(600);
    expect(frames.size).toBe(1);
    runFrame();
    const first = view.box.top;
    expect(first).toBeGreaterThan(600);
    expect(first).toBeLessThan(1_100);
    view.grow(200);
    expect(frames.size).toBe(1);
    const tops = settle(view.box);
    expect(tops.length).toBeGreaterThan(5);
    expect(tops.every((top, index) => top >= (tops[index - 1] ?? first))).toBe(true);
    expect(view.box.top).toBe(view.max());
  });

  it('stops following as soon as the person scrolls away and cancels the animation', () => {
    const view = scrollBox();
    const follower = followBottom(view.element);
    view.observer().notify(view.element);
    view.grow(400);
    runFrame();
    view.scrollTo(view.box.top - 120);
    expect(follower.following).toBe(false);
    expect(frames.size).toBe(0);
    const reading = view.box.top;
    view.grow(300);
    expect(frames.size).toBe(0);
    expect(view.box.top).toBe(reading);
    expect(view.element.style.overflowAnchor).toBe('');
  });

  it('stops on a wheel or a key scrolling up before any scroll event, not on typing', () => {
    const view = scrollBox();
    const textarea = document.createElement('textarea');
    view.element.append(textarea);
    const follower = followBottom(view.element);
    view.observer().notify(view.element);
    view.element.dispatchEvent(new WheelEvent('wheel', { deltaY: 60 }));
    expect(follower.following).toBe(true);
    view.element.dispatchEvent(new WheelEvent('wheel', { deltaY: -60 }));
    expect(follower.following).toBe(false);

    follower.jump();
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(follower.following).toBe(true);
    for (const init of [{ key: 'PageUp' }, { key: 'Home' }, { key: ' ', shiftKey: true }]) {
      follower.jump();
      view.element.dispatchEvent(new KeyboardEvent('keydown', { ...init, bubbles: true }));
      expect(follower.following).toBe(false);
    }
  });

  it('follows again once the person comes back to the bottom themselves', () => {
    const view = scrollBox();
    const follower = followBottom(view.element);
    view.observer().notify(view.element);
    view.scrollTo(200);
    expect(follower.following).toBe(false);
    view.scrollTo(400);
    expect(follower.following).toBe(false);
    view.scrollTo(view.max() - 30);
    expect(follower.following).toBe(true);
    expect(view.element.style.overflowAnchor).toBe('none');
    view.grow(250);
    settle(view.box);
    expect(view.box.top).toBe(view.max());
  });

  it('ignores its own movement and content shrinking under a pinned view', () => {
    const view = scrollBox();
    const follower = followBottom(view.element);
    view.observer().notify(view.element);
    view.grow(300);
    runFrame();
    // The scroll event of the follower's own write is not the person's.
    view.element.dispatchEvent(new Event('scroll'));
    expect(follower.following).toBe(true);
    settle(view.box);
    // A disclosure folding at the bottom clamps the view: it moved up, but stays at the bottom.
    view.box.height -= 350;
    view.scrollTo(view.box.top);
    expect(follower.following).toBe(true);
  });

  it('lands at once when motion is reduced by the system or by the app', () => {
    for (const reduce of ['system', 'app'] as const) {
      vi.stubGlobal('matchMedia', () => ({ matches: reduce === 'system' }));
      if (reduce === 'app') document.documentElement.dataset.reducedMotion = 'true';
      const view = scrollBox();
      const follower = followBottom(view.element);
      view.observer().notify(view.element);
      view.grow(700);
      expect(view.box.top).toBe(view.max());
      expect(frames.size).toBe(0);
      view.scrollTo(0);
      follower.ease();
      expect(view.box.top).toBe(view.max());
      follower.dispose();
    }
  });

  it('lands at once when the viewport resizes or new content replaces the children', async () => {
    const view = scrollBox();
    const follower = followBottom(view.element);
    view.observer().notify(view.element);
    view.box.viewport = 250;
    view.observer().notify(view.element);
    expect(view.box.top).toBe(750);
    const page = document.createElement('section');
    view.content.replaceWith(page);
    await Promise.resolve();
    expect(view.observer().observed.has(page)).toBe(true);
    expect(view.observer().observed.has(view.content)).toBe(false);
    // Replaced children can send the view back to the top: the browser's doing, not a scroll away.
    view.box.height += 900;
    view.scrollTo(0);
    expect(follower.following).toBe(true);
    view.observer().notify(page);
    expect(view.box.top).toBe(view.max());
    // No animation follows: every later frame leaves the view where it landed.
    expect(settle(view.box).every((top) => top === view.max())).toBe(true);
  });

  it('does not pull against a finger, and a scrollbar press stops the animation', () => {
    const view = scrollBox();
    const follower = followBottom(view.element);
    view.observer().notify(view.element);
    view.element.dispatchEvent(new Event('touchstart'));
    view.grow(300);
    expect(frames.size).toBe(0);
    window.dispatchEvent(new Event('touchend'));
    expect(frames.size).toBe(1);
    runFrame();
    view.element.dispatchEvent(new Event('pointerdown'));
    expect(frames.size).toBe(0);
    expect(follower.following).toBe(true);
  });

  it('comes back to the bottom on demand, eased or at once', () => {
    const view = scrollBox(2_000);
    const follower = followBottom(view.element);
    view.observer().notify(view.element);
    view.scrollTo(100);
    expect(follower.following).toBe(false);
    follower.ease();
    expect(follower.following).toBe(true);
    expect(frames.size).toBe(1);
    settle(view.box);
    expect(view.box.top).toBe(view.max());
    view.scrollTo(100);
    follower.jump();
    expect(view.box.top).toBe(view.max());
  });

  it('lets go of its observers, frames and listeners when disposed', () => {
    const view = scrollBox();
    const follower = followBottom(view.element);
    view.observer().notify(view.element);
    view.grow(300);
    follower.dispose();
    expect(frames.size).toBe(0);
    expect(view.observer().disconnected).toBe(true);
    expect(view.element.style.overflowAnchor).toBe('');
    view.element.dispatchEvent(new WheelEvent('wheel', { deltaY: -60 }));
    expect(follower.following).toBe(true);
  });
});

describe('useStickToBottom', () => {
  function Transcript() {
    const { scrollRef, scrollToBottom } = useStickToBottom();
    return (
      <>
        <div data-testid="scroller" ref={scrollRef}>
          <p>Contenu</p>
        </div>
        <button onClick={scrollToBottom} type="button">
          Envoyer
        </button>
      </>
    );
  }

  it('follows its container while mounted and stops on unmount', async () => {
    const user = userEvent.setup();
    const view = render(<Transcript />);
    const observer = FakeResizeObserver.last!;
    const scroller = screen.getByTestId('scroller');
    expect(observer.observed.has(scroller)).toBe(true);
    expect(scroller.style.overflowAnchor).toBe('none');
    scroller.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }));
    expect(scroller.style.overflowAnchor).toBe('');
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(scroller.style.overflowAnchor).toBe('none');
    act(() => view.unmount());
    expect(observer.disconnected).toBe(true);
  });
});
