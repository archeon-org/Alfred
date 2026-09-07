import { z } from 'zod/mini';
import { describe, expect, it } from 'vitest';
import { API_ERROR_CODES, apiErrorSchema } from '@alfred/contracts';

describe('shared error contract', () => {
  it.each(['stale_revision', 'HTTP_404'])('accepts %s and optional public details', (code) => {
    expect(
      z.safeParse(apiErrorSchema, {
        success: false,
        error: { code, message: 'Unavailable', details: { revision: 2 } },
      }).success,
    ).toBe(true);
  });
  it('retains existing DTO validation message arrays', () => {
    expect(
      z.safeParse(apiErrorSchema, {
        success: false,
        error: { code: 'HTTP_400', message: ['Invalid limit'] },
      }).success,
    ).toBe(true);
  });
  it('rejects malformed envelopes and keeps codes unique', () => {
    expect(
      z.safeParse(apiErrorSchema, { success: true, error: { code: 1, message: null } }).success,
    ).toBe(false);
    expect(new Set(API_ERROR_CODES).size).toBe(API_ERROR_CODES.length);
  });
});
