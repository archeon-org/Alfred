import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { AccessTokenGuard } from '../../src/common/guards/access-token.guard';

function createContext(authorization?: string) {
  const request: Record<string, unknown> = {
    headers: authorization === undefined ? {} : { authorization },
  };
  const context = {
    getClass: vi.fn(),
    getHandler: vi.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('AccessTokenGuard', () => {
  it('allows only endpoints explicitly marked as public without a token', async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(true) };
    const jwt = { verifyAsync: vi.fn() };
    const guard = new AccessTokenGuard(
      reflector as unknown as Reflector,
      jwt as unknown as JwtService,
    );

    const { context } = createContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects a protected request that has no bearer token', async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) };
    const jwt = { verifyAsync: vi.fn() };
    const guard = new AccessTokenGuard(
      reflector as unknown as Reflector,
      jwt as unknown as JwtService,
    );

    const { context } = createContext();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      guard.canActivate(createContext('Basic credentials').context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches a validated Alfred principal and rejects non-access JWTs', async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) };
    const jwt = {
      verifyAsync: vi.fn().mockResolvedValue({
        email: 'person@example.test',
        role: 'user',
        sid: '82d76f0c-b0f4-4f01-8a9d-0ea09f506cb8',
        sub: '21dd1aaa-d564-4a45-9a07-dbc5777d25d5',
        typ: 'access',
      }),
    };
    const guard = new AccessTokenGuard(
      reflector as unknown as Reflector,
      jwt as unknown as JwtService,
    );
    const { context, request } = createContext('Bearer signed-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      email: 'person@example.test',
      id: '21dd1aaa-d564-4a45-9a07-dbc5777d25d5',
      role: 'user',
      sessionId: '82d76f0c-b0f4-4f01-8a9d-0ea09f506cb8',
    });

    jwt.verifyAsync.mockResolvedValueOnce({ sub: 'user-id', typ: 'refresh' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
