import { CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import type { UserRole } from '../auth/auth-principal';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<readonly UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles === undefined || roles.length === 0) return true;

    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (principal === undefined || !roles.includes(principal.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
