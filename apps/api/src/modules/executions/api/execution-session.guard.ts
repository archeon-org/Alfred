import {
  CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { StreamAuthorityService } from '../../stream/application/stream-authority.service';

@Injectable()
export class ExecutionSessionGuard implements CanActivate {
  constructor(private readonly authority: StreamAuthorityService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthPrincipal }>();
    if (request.user === undefined) throw new UnauthorizedException();
    await this.authority.assert(request.user, request.headers.authorization);
    return true;
  }
}
