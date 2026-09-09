import { useEffect, useRef } from 'react';

/** Observe inside an overflowing container, or the mobile document viewport. */
export function useInfiniteScroll(enabled: boolean, onLoadMore: () => void) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = sentinel.current;
    if (!enabled || element === null || typeof IntersectionObserver === 'undefined') return;
    const container = element.closest<HTMLElement>('[data-conversation-scroll-root]');
    let observer: IntersectionObserver;
    const observe = () => {
      observer?.disconnect();
      const scrolls =
        container &&
        /auto|scroll/u.test(getComputedStyle(container).overflowY) &&
        container.scrollHeight > container.clientHeight;
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
        },
        { root: scrolls ? container : null, rootMargin: '0px 0px 80px 0px' },
      );
      observer.observe(element);
    };
    observe();
    window.addEventListener('resize', observe);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', observe);
    };
  }, [enabled, onLoadMore]);
  return sentinel;
}
