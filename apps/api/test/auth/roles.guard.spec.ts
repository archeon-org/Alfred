import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import type { AuthPrincipal } from '../../src/common/auth/auth-principal';
import { RolesGuard } from '../../src/common/guards/roles.guard';

const user: AuthPrincipal = Object.freeze({
  email: 'person@example.test',
  id: '21dd1aaa-d564-4a45-9a07-dbc5777d25d5',
  role: 'user',
  sessionId: '82d76f0c-b0f4-4f01-8a9d-0ea09f506cb8',
});

function contextWith(principal?: AuthPrincipal): ExecutionContext {
  return {
    getClass: vi.fn(),
    getHandler: vi.fn(),
    switchToHttp: () => ({ getRequest: () => ({ user: principal }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows authenticated routes that do not declare role restrictions', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
    const guard = new RolesGuard(reflector as unknown as Reflector);

    expect(guard.canActivate(contextWith(user))).toBe(true);
  });

  it('allows only principals whose role is explicitly accepted', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['user']) };
    const guard = new RolesGuard(reflector as unknown as Reflector);

    expect(guard.canActivate(contextWith(user))).toBe(true);
  });

  it('rejects missing principals and insufficient roles', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['admin']) };
    const guard = new RolesGuard(reflector as unknown as Reflector);

    expect(() => guard.canActivate(contextWith())).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextWith(user))).toThrow(ForbiddenException);
  });
});
