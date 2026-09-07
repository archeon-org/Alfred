import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ApiException } from '@api/common/errors/api.exception';

describe('ApiException', () => {
  it('exposes a stable business code and optional public details', () => {
    const error = new ApiException(409, 'stale_revision', 'Revision changed.', { revision: 2 });
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual({
      code: 'stale_revision',
      message: 'Revision changed.',
      details: { revision: 2 },
    });
  });
  it('omits absent details', () => {
    expect(new ApiException(400, 'invalid_name', 'Invalid name.').getResponse()).toEqual({
      code: 'invalid_name',
      message: 'Invalid name.',
    });
  });
});
