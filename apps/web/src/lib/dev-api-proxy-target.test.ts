import { describe, expect, it } from 'vitest';

import { resolveDevApiProxyTarget } from './dev-api-proxy-target';

describe('development API proxy configuration', () => {
  it('uses the server-only value loaded from the Vite environment file', () => {
    expect(resolveDevApiProxyTarget(undefined, 'http://api.internal.test:3000')).toBe(
      'http://api.internal.test:3000',
    );
  });

  it('lets an explicit process environment value override the environment file', () => {
    expect(resolveDevApiProxyTarget('http://127.0.0.1:4000', 'http://127.0.0.1:3000')).toBe(
      'http://127.0.0.1:4000',
    );
  });
});
