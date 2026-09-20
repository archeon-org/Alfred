import { useCallback, useRef, type RefCallback } from 'react';

/** Pixels from the bottom that still count as being at the bottom. */
export const STICK_THRESHOLD = 48;
/** Time constant of the easing: about 95 % of any distance is covered in three of them. */
const EASE_MS = 60;
/** The last pixels land on the bottom at once rather than creeping one pixel per frame. */
const SNAP_PX = 4;
/** A frame longer than this (a background tab, a long task) advances as if it were this long. */
const MAX_FRAME_MS = 64;
/** How long focus moved by the keyboard explains a scroll: the browser reveals the focused element. */
const FOCUS_INTENT_MS = 300;
const KEYS_SCROLLING = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
const KEYS_SCROLLING_UP = new Set(['ArrowUp', 'PageUp', 'Home']);

export interface BottomFollower {
  /** Lands on the bottom at once and follows from there. */
  jump(): void;
  /** Eases to the bottom and follows from there; lands at once when motion is reduced. */
  ease(): void;
  /** Whether content growth keeps the view pinned to the bottom. */
  readonly following: boolean;
  dispose(): void;
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

type Listener = readonly [EventTarget, string, (event: never) => void, AddEventListenerOptions?];

/**
 * Keeps a scroll container pinned to its bottom while its content grows, as long as the person
 * stays there. Only `element` is ever scrolled. Growth of content already shown eases toward the
 * moving bottom one animation frame at a time; a resized viewport, content replacing the
 * container's children and reduced motion land at once.
 *
 * A scroll away from the bottom that the follower did not write releases it at once when the person
 * causes it (wheel, touch, keys, a pressed pointer, keyboard focus) or when nothing else explains
 * it. Content that shrinks for a moment (a disclosure folding, a placeholder replaced) clamps the
 * view to a shorter bottom, and the browser may report that clamp only after more content arrived:
 * such a move, in the frame of a content change and with no input, keeps following. The person
 * scrolling back to the bottom engages it again. The scrolling keys pressed while an ancestor holds
 * the focus (the landmark a route change focuses) move the focus into a focusable container so
 * that they scroll it.
 */
export function followBottom(element: HTMLElement, threshold = STICK_THRESHOLD): BottomFollower {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let following = true;
  let frame: number | null = null;
  let frameAt: number | null = null;
  /** The position the follower last wrote: a scroll event there is its own. */
  let written: number | null = null;
  let lastTop = element.scrollTop;
  /** A finger holds the view: the follower does not pull against it. */
  let held = false;
  /** A pointer is pressed on the container, its scrollbar or its content. */
  let pressed = false;
  let pressedAt = -Infinity;
  let focusedAt = -Infinity;
  /** Children were added since the last resize: new content lands, it does not scroll by. */
  let landing = false;
  /** The content changed since the current frame began: layout may have clamped the view. */
  let changed = false;
  let changeFrame: number | null = null;

  const maxTop = () => Math.max(0, element.scrollHeight - element.clientHeight);
  const gap = () => maxTop() - element.scrollTop;
  const reduced = () =>
    document.documentElement.dataset.reducedMotion === 'true' || reducedMotion?.matches === true;
  const interacting = () => held || pressed || performance.now() - focusedAt < FOCUS_INTENT_MS;

  const setFollowing = (value: boolean) => {
    following = value;
    // Anchoring would move the view when content above shrinks, which reads as a scroll away.
    const anchor = value ? 'none' : '';
    if (element.style.overflowAnchor !== anchor) element.style.overflowAnchor = anchor;
  };
  const write = (top: number) => {
    element.scrollTop = top;
    written = element.scrollTop;
    lastTop = written;
  };
  const cancel = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    frameAt = null;
  };
  const release = () => {
    setFollowing(false);
    cancel();
  };

  const step = (now: number) => {
    frame = null;
    const from = element.scrollTop;
    const target = maxTop();
    const remaining = target - from;
    if (!following || held || remaining <= 0) {
      frameAt = null;
      return;
    }
    const elapsed = frameAt === null ? 16 : Math.min(Math.max(now - frameAt, 0), MAX_FRAME_MS);
    frameAt = now;
    const advance = Math.max(remaining * (1 - Math.exp(-elapsed / EASE_MS)), 1);
    // Whole pixels: engines that truncate a fractional position would otherwise crawl to the end.
    write(remaining - advance < SNAP_PX ? target : Math.min(target, Math.ceil(from + advance)));
    // A container that cannot move further (fractional layout, a hidden element) ends it too.
    if (element.scrollTop > from && element.scrollTop < target) frame = requestAnimationFrame(step);
    else frameAt = null;
  };

  const jump = () => {
    cancel();
    setFollowing(true);
    if (gap() > 0) write(maxTop());
  };
  const ease = () => {
    setFollowing(true);
    if (reduced()) jump();
    else if (frame === null && gap() > 0.5) frame = requestAnimationFrame(step);
  };

  const markChanged = () => {
    changed = true;
    // Animation frame callbacks run after the frame's scroll events: a clamp reported in this
    // frame still finds the change, a scroll in a later frame does not.
    changeFrame ??= requestAnimationFrame(() => {
      changeFrame = null;
      changed = false;
    });
  };

  const onResize = (entries: readonly ResizeObserverEntry[]) => {
    const land = landing || entries.some((entry) => entry.target === element);
    landing = false;
    if (!following || held) return;
    // Layout just clamped the pinned view to content that shrank; the scroll event that reports
    // it comes in a later frame, possibly after more content arrived. That position is not a move.
    if (element.scrollTop < lastTop) lastTop = element.scrollTop;
    if (gap() <= 0.5) return;
    if (land) jump();
    else ease();
  };
  const onScroll = () => {
    const top = element.scrollTop;
    const previous = lastTop;
    lastTop = top;
    if (written !== null && Math.abs(top - written) <= 1) return;
    written = null;
    // Replaced children can reset the position (Firefox scrolls back to the top): it is the
    // browser's doing, and the pending landing puts the view back at the bottom.
    if (landing) return;
    const away = gap();
    if (top < previous - 1 && away > 1) {
      if (changed && !interacting()) {
        if (following) ease();
      } else release();
    } else if (top > previous && away <= threshold) setFollowing(true);
  };
  const onWheel = (event: WheelEvent) => {
    if (event.deltaY < 0 && element.scrollTop > 0) release();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const { target, key } = event;
    if (event.altKey || event.ctrlKey || event.metaKey || !KEYS_SCROLLING.has(key)) return;
    if (!(target instanceof Node) || isEditable(target)) return;
    if (target !== element && !element.contains(target)) {
      if (!target.contains(element) || !element.hasAttribute('tabindex')) return;
      element.focus({ preventScroll: true });
    }
    if (KEYS_SCROLLING_UP.has(key) || (key === ' ' && event.shiftKey)) release();
  };
  const onFocusIn = () => {
    // Focus moved by the keyboard reveals its element; a click's focus does not scroll.
    if (!pressed && performance.now() - pressedAt > FOCUS_INTENT_MS) focusedAt = performance.now();
  };
  const hold = () => {
    held = true;
    cancel();
  };
  const letGo = () => {
    if (!held) return;
    held = false;
    if (following && gap() > 0.5) ease();
  };
  const onPointerDown = (event: PointerEvent) => {
    pressed = true;
    pressedAt = performance.now();
    // The container itself is the target on its scrollbar: the drag, not the animation, leads.
    if (event.target === element) cancel();
  };
  // Some engines report no release after a scrollbar drag: the next move without buttons does.
  const onPointerMove = (event: PointerEvent) => {
    if (event.buttons === 0) pressed = false;
  };
  const onPointerUp = () => {
    pressed = false;
  };

  const resizes = new ResizeObserver(onResize);
  resizes.observe(element);
  for (const child of element.children) resizes.observe(child);
  const mutations = new MutationObserver((records) => {
    for (const record of records) {
      // The container's own attributes are the follower's writes, not content.
      if (record.target === element && record.type !== 'childList') continue;
      markChanged();
      if (record.target !== element) continue;
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        resizes.observe(node);
        landing = true;
      }
      for (const node of record.removedNodes) if (node instanceof Element) resizes.unobserve(node);
    }
  });
  mutations.observe(element, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });
  const passive = { passive: true } as const;
  const listeners: readonly Listener[] = [
    [element, 'scroll', onScroll, passive],
    [element, 'wheel', onWheel, passive],
    [element, 'touchstart', hold, passive],
    [element, 'pointerdown', onPointerDown, passive],
    [element, 'focusin', onFocusIn],
    [document, 'keydown', onKeyDown],
    [window, 'touchend', letGo],
    [window, 'touchcancel', letGo],
    [window, 'pointerup', onPointerUp, passive],
    [window, 'pointercancel', onPointerUp, passive],
    [window, 'pointermove', onPointerMove, passive],
  ];
  for (const [target, type, listener, options] of listeners)
    target.addEventListener(type, listener as EventListener, options);
  setFollowing(true);

  return {
    jump,
    ease,
    get following() {
      return following;
    },
    dispose() {
      cancel();
      if (changeFrame !== null) cancelAnimationFrame(changeFrame);
      resizes.disconnect();
      mutations.disconnect();
      for (const [target, type, listener, options] of listeners)
        target.removeEventListener(type, listener as EventListener, options);
      element.style.overflowAnchor = '';
    },
  };
}

export interface StickToBottom {
  /** Attach to the scroll container; following starts at once and stops on unmount. */
  readonly scrollRef: RefCallback<HTMLElement>;
  /** Eases to the bottom and follows again, for example after sending a message. */
  readonly scrollToBottom: () => void;
  /** Lands on the bottom without animation and follows again. */
  readonly jumpToBottom: () => void;
}

/** Stick-to-bottom following of a scroll container; see `followBottom` for its decisions. */
export function useStickToBottom(threshold = STICK_THRESHOLD): StickToBottom {
  const follower = useRef<BottomFollower | null>(null);
  const scrollRef = useCallback(
    (element: HTMLElement | null) => {
      if (element === null) return;
      const created = followBottom(element, threshold);
      follower.current = created;
      return () => {
        created.dispose();
        if (follower.current === created) follower.current = null;
      };
    },
    [threshold],
  );
  const scrollToBottom = useCallback(() => follower.current?.ease(), []);
  const jumpToBottom = useCallback(() => follower.current?.jump(), []);
  return { scrollRef, scrollToBottom, jumpToBottom };
}
