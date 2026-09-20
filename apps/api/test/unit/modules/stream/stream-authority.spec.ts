import { describe, expect, it, vi } from 'vitest';
import type { JwtService } from '@nestjs/jwt';
import type { DataSource } from 'typeorm';
import { StreamAuthorityService } from '@api/modules/stream/application/stream-authority.service';
import { principal } from '../../../support/project-fixtures';

function fixture(
  payload: unknown = {
    typ: 'access',
    sub: principal.id,
    sid: principal.sessionId,
    exp: Math.floor(Date.now() / 1000) + 30,
  },
) {
  const verifyAsync = vi.fn().mockResolvedValue(payload);
  const exists = vi.fn().mockResolvedValue(true);
  const service = new StreamAuthorityService(
    { verifyAsync } as unknown as JwtService,
    { getRepository: () => ({ exists }) } as unknown as DataSource,
  );
  return { service, verifyAsync, exists };
}
describe('stream authority', () => {
  it('requires a verified matching bearer and a live refresh session', async () => {
    const { service, exists } = fixture();
    await expect(service.assert(principal, 'Bearer credential')).resolves.toBeGreaterThan(
      Date.now(),
    );
    expect(exists).toHaveBeenCalledTimes(2);
  });
  it('denies a revoked family/session even while access JWT remains valid', async () => {
    const { service, exists } = fixture();
    exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(service.assert(principal, 'Bearer credential')).rejects.toThrow(
      'Stream authentication required',
    );
  });
  it('denies a missing finite expiry instead of opening an unlimited observer', async () => {
    const { service } = fixture({ typ: 'access', sub: principal.id, sid: principal.sessionId });
    await expect(service.assert(principal, 'Bearer credential')).rejects.toThrow();
  });
  it('never accepts a different signed subject', async () => {
    const { service } = fixture({
      typ: 'access',
      sub: 'other',
      sid: principal.sessionId,
      exp: 9e9,
    });
    await expect(service.assert(principal, 'Bearer credential')).rejects.toThrow();
  });
});
