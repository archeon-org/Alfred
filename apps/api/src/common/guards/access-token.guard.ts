import {
  CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AccessTokenPayload, AuthPrincipal, UserRole } from '../auth/auth-principal';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

function isRole(value: unknown): value is UserRole {
  return value === 'admin' || value === 'user';
}

function toPrincipal(payload: Partial<AccessTokenPayload>): AuthPrincipal | null {
  if (
    payload.typ !== 'access' ||
    typeof payload.sub !== 'string' ||
    typeof payload.sid !== 'string' ||
    typeof payload.email !== 'string' ||
    !isRole(payload.role)
  ) {
    return null;
  }

  return Object.freeze({
    email: payload.email,
    id: payload.sub,
    role: payload.role,
    sessionId: payload.sid,
  });
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthPrincipal }>();
    const token = this.extractBearerToken(request);
    if (token === undefined) throw new UnauthorizedException('Authentication required');

    try {
      const principal = toPrincipal(await this.jwtService.verifyAsync<AccessTokenPayload>(token));
      if (principal === null) throw new UnauthorizedException('Invalid access token');
      request.user = principal;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private extractBearerToken(request: Request): string | undefined {
    const [scheme, token, extra] = request.headers.authorization?.split(' ') ?? [];
    return scheme === 'Bearer' && token !== undefined && extra === undefined ? token : undefined;
  }
}
