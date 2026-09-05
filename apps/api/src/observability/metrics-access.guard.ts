import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

function matchesToken(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

@Injectable()
export class MetricsAccessGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.config.getOrThrow<boolean>('OBSERVABILITY_METRICS_ENABLED')) {
      throw new NotFoundException();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const expected = this.config.getOrThrow<string>('OBSERVABILITY_METRICS_TOKEN');
    const authorization = request.headers.authorization;
    const received = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined;

    if (received === undefined || !matchesToken(received, expected)) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
