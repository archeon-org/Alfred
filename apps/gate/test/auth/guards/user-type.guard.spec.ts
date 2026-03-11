import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserTypeGuard } from 'src/auth/guards/user-type.guard';

describe('UserTypeGuard', () => {
  const makeContext = (user?: unknown) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  it('allows access when no role metadata is present', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new UserTypeGuard(reflector);

    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('denies access when roles are required but no user exists', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['ADMIN']),
    } as unknown as Reflector;
    const guard = new UserTypeGuard(reflector);

    expect(guard.canActivate(makeContext(undefined))).toBe(false);
  });

  it('allows access when user role matches one of required roles', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['ADMIN', 'USER']),
    } as unknown as Reflector;
    const guard = new UserTypeGuard(reflector);

    expect(guard.canActivate(makeContext({ role: 'USER' }))).toBe(true);
  });

  it('denies access when user role does not match required roles', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['ADMIN']),
    } as unknown as Reflector;
    const guard = new UserTypeGuard(reflector);

    expect(guard.canActivate(makeContext({ role: 'USER' }))).toBe(false);
  });
});
