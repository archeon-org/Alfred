import { describe, expect, it } from 'vitest';

import { ObservedWorkCache } from '@api/modules/stream/application/observed-view';

const work = (omittedSteps: number) => ({ steps: [], omittedSteps });

describe('observed work cache', () => {
  it('builds each committed revision once and keeps a bounded number of them', () => {
    const cache = new ObservedWorkCache();
    let builds = 0;
    const build = (value: number) => () => {
      builds += 1;
      return work(value);
    };
    const first = cache.get('a:1', build(1));
    expect(cache.get('a:1', build(99))).toBe(first);
    expect(builds).toBe(1);
    expect(cache.get('a:2', build(2)).omittedSteps).toBe(2);
    for (let index = 0; index < 256; index += 1) cache.get(`b:${index}`, build(index));
    // The oldest revision was dropped and is built again.
    expect(cache.get('a:1', build(7)).omittedSteps).toBe(7);
  });
});
