import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import Redis from 'ioredis';

export interface RateLimitConfig {
  ttl: number;
  limit: number;
  keyPrefix?: string;
}

export const RATE_LIMITS = {
  STANDARD: { ttl: 60, limit: 100, keyPrefix: 'rl:std' },
  SEARCH: { ttl: 60, limit: 30, keyPrefix: 'rl:search' },
  UPLOAD: { ttl: 60, limit: 10, keyPrefix: 'rl:upload' },
  AUTH: { ttl: 60, limit: 20, keyPrefix: 'rl:auth' },
  STRICT: { ttl: 60, limit: 5, keyPrefix: 'rl:strict' },
} as const;

export const THROTTLE_KEY = 'throttle';
export const SKIP_THROTTLE_KEY = 'skipThrottle';

@Injectable()
export class ThrottlerGuard implements CanActivate {
  private redis: Redis | null = null;
  private inMemoryStore: Map<string, { count: number; resetAt: number }> =
    new Map();

  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {
    this.initializeRedis();
  }

  private initializeRedis(): void {
    try {
      const redisUrl = this.configService.get<string>('REDIS_URL');
      if (redisUrl) {
        this.redis = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          lazyConnect: true,
          retryStrategy: (times: number) => Math.min(times * 100, 3000),
        });
        this.redis.on('error', (err) => {
          console.warn(
            'Redis rate limiter error, falling back to memory:',
            err.message,
          );
          this.redis = null;
        });
      }
    } catch {
      console.warn('Redis connection failed, using in-memory rate limiting');
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skipThrottle = this.reflector.getAllAndOverride<boolean>(
      SKIP_THROTTLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipThrottle) {
      return true;
    }

    const rateLimitConfig =
      this.reflector.getAllAndOverride<RateLimitConfig>(THROTTLE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || RATE_LIMITS.STANDARD;

    const request = context.switchToHttp().getRequest<Request>();
    const key = this.generateKey(request, rateLimitConfig.keyPrefix || 'rl');

    try {
      const { current, remaining, resetTime } = await this.checkRateLimit(
        key,
        rateLimitConfig,
      );

      const response = context.switchToHttp().getResponse();
      response.header('X-RateLimit-Limit', rateLimitConfig.limit.toString());
      response.header('X-RateLimit-Remaining', remaining.toString());
      response.header('X-RateLimit-Reset', resetTime.toString());

      if (current > rateLimitConfig.limit) {
        response.header('Retry-After', rateLimitConfig.ttl.toString());
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many requests. Please try again later.',
            error: 'Too Many Requests',
            retryAfter: rateLimitConfig.ttl,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      console.warn('Rate limiter error, allowing request:', error);
      return true;
    }
  }

  private generateKey(request: Request, prefix: string): string {
    const user = request.user as { id?: string } | undefined;

    if (user?.id) {
      return `${prefix}:user:${user.id}`;
    }

    const ip = this.getClientIp(request);
    return `${prefix}:ip:${ip}`;
  }

  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded)) {
      return forwarded[0];
    }
    return request.ip || request.socket.remoteAddress || 'unknown';
  }

  private async checkRateLimit(
    key: string,
    config: RateLimitConfig,
  ): Promise<{ current: number; remaining: number; resetTime: number }> {
    if (this.redis) {
      return this.checkRateLimitRedis(key, config);
    }
    return this.checkRateLimitMemory(key, config);
  }

  private async checkRateLimitRedis(
    key: string,
    config: RateLimitConfig,
  ): Promise<{ current: number; remaining: number; resetTime: number }> {
    const now = Math.floor(Date.now() / 1000);
    const windowKey = `${key}:${Math.floor(now / config.ttl)}`;
    const resetTime = (Math.floor(now / config.ttl) + 1) * config.ttl;

    const current = await this.redis!.incr(windowKey);
    if (current === 1) {
      await this.redis!.expire(windowKey, config.ttl);
    }

    const remaining = Math.max(0, config.limit - current);
    return { current, remaining, resetTime };
  }

  private checkRateLimitMemory(
    key: string,
    config: RateLimitConfig,
  ): { current: number; remaining: number; resetTime: number } {
    const now = Date.now();
    const resetTime = now + config.ttl * 1000;

    const existing = this.inMemoryStore.get(key);

    if (existing && existing.resetAt > now) {
      existing.count += 1;
      const remaining = Math.max(0, config.limit - existing.count);
      return {
        current: existing.count,
        remaining,
        resetTime: Math.floor(existing.resetAt / 1000),
      };
    }

    if (this.inMemoryStore.size > 10000) {
      this.cleanupMemoryStore();
    }

    this.inMemoryStore.set(key, { count: 1, resetAt: resetTime });
    return {
      current: 1,
      remaining: config.limit - 1,
      resetTime: Math.floor(resetTime / 1000),
    };
  }

  private cleanupMemoryStore(): void {
    const now = Date.now();
    for (const [key, value] of this.inMemoryStore.entries()) {
      if (value.resetAt <= now) {
        this.inMemoryStore.delete(key);
      }
    }
  }
}
