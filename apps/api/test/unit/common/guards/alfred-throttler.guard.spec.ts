import { describe, expect, it } from 'vitest';

import {
  authenticatedThrottleTracker,
  ipThrottleTracker,
} from '@api/common/guards/alfred-throttler.guard';

describe('two-stage throttle trackers', () => {
  it('always uses the resolved client address for the pre-authentication quota', () => {
    expect(ipThrottleTracker({ ip: '10.0.0.10', user: { id: 'user-a' } })).toBe('ip:10.0.0.10');
  });

  it('isolates authenticated users after the access-token guard', () => {
    expect(authenticatedThrottleTracker({ ip: '10.0.0.10', user: { id: 'user-a' } })).toBe(
      'user:user-a',
    );
    expect(authenticatedThrottleTracker({ ip: '10.0.0.10', user: { id: 'user-b' } })).toBe(
      'user:user-b',
    );
  });

  it('uses bounded fallback buckets when proxy or principal data is unavailable', () => {
    expect(ipThrottleTracker({})).toBe('ip:unknown');
    expect(authenticatedThrottleTracker({})).toBe('user:unknown');
  });
});
