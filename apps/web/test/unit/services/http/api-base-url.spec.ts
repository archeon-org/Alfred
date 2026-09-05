import { describe, expect, it } from 'vitest';

import { normalizeApiBaseUrl } from '@/services/http/api-base-url';

describe('API URL configuration', () => {
  it.each(['https://api.example.test', '//api.example.test', '/\\api.example.test'])(
    'rejects the cross-origin base URL %s',
    (value) => {
      expect(() => normalizeApiBaseUrl(value)).toThrow(/same-origin relative path/u);
    },
  );

  it('normalizes a same-origin relative API base URL', () => {
    expect(normalizeApiBaseUrl('/internal/api///')).toBe('/internal/api');
    expect(normalizeApiBaseUrl(undefined)).toBe('/api');
  });
});
