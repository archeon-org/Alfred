import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useInfiniteScroll } from '@/hooks/ui/use-infinite-scroll';
import { installIntersectionObserver } from '../../../support/intersection-observer';

function Harness({ onLoadMore, version }: { onLoadMore: () => void; version: number }) {
  const sentinel = useInfiniteScroll(true, onLoadMore);
  // A new key replaces the sentinel element while `enabled` and `onLoadMore` stay the same.
  return <div data-testid="sentinel" key={version} ref={sentinel} />;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useInfiniteScroll', () => {
  it('observes a replacement sentinel without any other dependency changing', () => {
    const observer = installIntersectionObserver();
    const onLoadMore = vi.fn();
    const { getByTestId, rerender } = render(<Harness onLoadMore={onLoadMore} version={1} />);
    const first = getByTestId('sentinel');
    observer.intersect(first);
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(<Harness onLoadMore={onLoadMore} version={2} />);
    const second = getByTestId('sentinel');
    expect(second).not.toBe(first);
    observer.intersect(first);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    observer.intersect(second);
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });
});
