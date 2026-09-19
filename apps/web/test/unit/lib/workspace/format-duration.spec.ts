import { describe, expect, it } from 'vitest';

import { durationBetween, formatDuration } from '@/lib/workspace/format-duration';

describe('durations of the work log', () => {
  it.each([
    [400, '0,4 s'],
    [9_940, '9,9 s'],
    [12_400, '12 s'],
    [394_000, '6 min 34 s'],
    [3_720_000, '1 h 02 min'],
    [-1, ''],
    [Number.NaN, ''],
  ])('formats %s ms as "%s"', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it('measures only between two known moments', () => {
    expect(durationBetween(1_000, 1_400)).toBe(400);
    expect(durationBetween(1_000, null)).toBeNull();
    expect(durationBetween(0, 1_400)).toBeNull();
    expect(durationBetween(2_000, 1_400)).toBe(0);
  });
});
