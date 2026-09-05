import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'node:crypto';

interface ThrottledRequest {
  readonly ip?: unknown;
  readonly user?: { readonly id?: unknown };
}

export function ipThrottleTracker(request: ThrottledRequest): string {
  const address = request.ip;
  return `ip:${typeof address === 'string' && address.trim() !== '' ? address : 'unknown'}`;
}

export function authenticatedThrottleTracker(request: ThrottledRequest): string {
  const userId = request.user?.id;
  return `user:${typeof userId === 'string' && userId.trim() !== '' ? userId : 'unknown'}`;
}

function globalThrottleKey(throttlerName: string, tracker: string): string {
  return createHash('sha256').update(`global:${throttlerName}:${tracker}`).digest('hex');
}

abstract class NamedThrottlerGuard extends ThrottlerGuard {
  protected abstract readonly throttlerName: string;

  override async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    this.throttlers = this.throttlers.filter(({ name }) => name === this.throttlerName);
  }
}

@Injectable()
export class IpThrottlerGuard extends NamedThrottlerGuard {
  protected readonly throttlerName = 'ip';

  protected override getTracker(request: Record<string, unknown>): Promise<string> {
    return Promise.resolve(ipThrottleTracker(request));
  }

  protected override generateKey(
    _context: ExecutionContext,
    tracker: string,
    throttlerName: string,
  ): string {
    return globalThrottleKey(throttlerName, tracker);
  }
}

@Injectable()
export class AuthenticatedThrottlerGuard extends NamedThrottlerGuard {
  protected readonly throttlerName = 'authenticated';

  protected override shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ThrottledRequest>();
    const userId = request.user?.id;
    if (typeof userId !== 'string' || userId.trim() === '') return Promise.resolve(true);
    return super.shouldSkip(context);
  }

  protected override getTracker(request: Record<string, unknown>): Promise<string> {
    return Promise.resolve(authenticatedThrottleTracker(request));
  }

  protected override generateKey(
    _context: ExecutionContext,
    tracker: string,
    throttlerName: string,
  ): string {
    return globalThrottleKey(throttlerName, tracker);
  }
}

abstract class RouteIpThrottlerGuard extends NamedThrottlerGuard {
  protected override getTracker(request: Record<string, unknown>): Promise<string> {
    return Promise.resolve(ipThrottleTracker(request));
  }
}

@Injectable()
export class OauthStartThrottlerGuard extends RouteIpThrottlerGuard {
  protected readonly throttlerName = 'oauth-start-ip';
}

@Injectable()
export class OauthCallbackThrottlerGuard extends RouteIpThrottlerGuard {
  protected readonly throttlerName = 'oauth-callback-ip';
}

@Injectable()
export class RefreshThrottlerGuard extends RouteIpThrottlerGuard {
  protected readonly throttlerName = 'refresh-ip';
}
