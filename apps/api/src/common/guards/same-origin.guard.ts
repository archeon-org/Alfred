import { CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class SameOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.headers.origin;
    const allowedOrigins = this.config.getOrThrow<readonly string[]>('API_CORS_ORIGINS');

    if (origin === undefined || !allowedOrigins.includes(origin)) {
      throw new ForbiddenException('Request origin is not allowed');
    }
    return true;
  }
}
