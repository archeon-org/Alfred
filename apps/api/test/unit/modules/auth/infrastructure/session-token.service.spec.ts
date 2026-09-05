import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';

import { SessionTokenService } from '@api/modules/auth/infrastructure/security/session-token.service';

describe('SessionTokenService', () => {
  it('never persists the opaque refresh token itself', () => {
    const service = new SessionTokenService(new JwtService({ secret: 'test' }));

    const first = service.createRefreshToken();
    const second = service.createRefreshToken();

    expect(first.raw).not.toEqual(first.hash);
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(service.hashRefreshToken(first.raw)).toBe(first.hash);
    expect(second.raw).not.toBe(first.raw);
  });

  it('issues short-lived access tokens with an explicit token type and session id', async () => {
    const signAsync = vi.fn().mockResolvedValue('signed-access-token');
    const service = new SessionTokenService({ signAsync } as unknown as JwtService);

    await expect(
      service.issueAccessToken({
        email: 'person@example.test',
        id: '21dd1aaa-d564-4a45-9a07-dbc5777d25d5',
        role: 'user',
        sessionId: '82d76f0c-b0f4-4f01-8a9d-0ea09f506cb8',
      }),
    ).resolves.toBe('signed-access-token');
    expect(signAsync).toHaveBeenCalledWith({
      email: 'person@example.test',
      role: 'user',
      sid: '82d76f0c-b0f4-4f01-8a9d-0ea09f506cb8',
      sub: '21dd1aaa-d564-4a45-9a07-dbc5777d25d5',
      typ: 'access',
    });
  });
});
