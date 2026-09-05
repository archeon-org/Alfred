import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

interface ThrottledRequest {
  readonly ip?: unknown;
  readonly user?: { readonly id?: unknown };
}

export function throttleTracker(request: ThrottledRequest): string {
  const userId = request.user?.id;
  if (typeof userId === 'string' && userId.trim() !== '') return `user:${userId}`;

  const address = request.ip;
  return `ip:${typeof address === 'string' && address.trim() !== '' ? address : 'unknown'}`;
}

@Injectable()
export class AlfredThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(request: Record<string, unknown>): Promise<string> {
    return Promise.resolve(throttleTracker(request));
  }
}
