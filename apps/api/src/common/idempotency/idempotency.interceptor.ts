import { createHash, randomUUID } from 'node:crypto';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { defer, from, last, type Observable, of, switchMap, throwError, timeout } from 'rxjs';
import type { AuthPrincipal } from '../auth/auth-principal';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ApiException } from '../errors/api.exception';
import { IDEMPOTENT_KEY } from './idempotent.decorator';
import { IdempotencyStore, type StoredResponse } from './idempotency.store';

const WAIT_MS = 2_000;
const POLL_MS = 50;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function inProgress(): ApiException {
  return new ApiException(
    409,
    'idempotency_in_progress',
    'This request is still in progress or requires reconciliation',
  );
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly store: IdempotencyStore,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // defer turns validation throws into observable errors and reserves only on subscription.
    return defer(() => {
      const request = context.switchToHttp().getRequest<Request & { user?: AuthPrincipal }>();
      const key = request.headers['idempotency-key'];
      if (!this.reflector.get<boolean>(IDEMPOTENT_KEY, context.getHandler()) || key === undefined)
        return next.handle();
      if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(key)) {
        throw new ApiException(400, 'invalid_idempotency_key', 'Invalid Idempotency-Key');
      }
      const owner = request.user?.id;
      if (!owner) throw new UnauthorizedException('Authentication required');
      if (
        request.method !== 'POST' ||
        this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
          context.getHandler(),
          context.getClass(),
        ]) ||
        /(?:^|\/)auth(?:\/|$)/iu.test(request.originalUrl.split('?')[0] ?? '')
      ) {
        throw new ApiException(
          400,
          'invalid_idempotency_key',
          'Idempotency is unavailable for this handler',
        );
      }
      const hash = createHash('sha256')
        .update(
          JSON.stringify([
            request.method.toUpperCase(),
            request.originalUrl,
            canonical(request.body ?? null),
          ]),
        )
        .digest('hex');
      const response = context.switchToHttp().getResponse<Response>();
      const reservationId = randomUUID();
      return from(this.acquire(owner, key, hash, reservationId)).pipe(
        // Includes reservation/read latency. A late INSERT may leave a tombstone, but cannot run the handler.
        timeout({ first: WAIT_MS, with: () => throwError(inProgress) }),
        switchMap((saved) => {
          if (saved !== null) {
            response.status(saved.responseStatus!);
            return of(saved.responseBody);
          }
          // No handler transaction is claimed here. Once reserved, errors/crashes/non-2xx
          // retain the reservation until its original 24h expiry: the handler may have committed.
          return next.handle().pipe(
            last(undefined, null),
            switchMap((body: unknown) =>
              from(this.persist(owner, key, hash, response, body, reservationId)),
            ),
          );
        }),
      );
    });
  }

  private async acquire(
    owner: string,
    key: string,
    hash: string,
    reservationId: string,
  ): Promise<StoredResponse | null> {
    const deadline = Date.now() + WAIT_MS;
    if (await this.store.reserve(owner, key, hash, reservationId)) return null;
    while (Date.now() < deadline) {
      const saved = await this.store.find(owner, key);
      if (saved !== null && saved.requestHash !== hash) {
        throw new ApiException(
          422,
          'idempotency_mismatch',
          'Idempotency-Key was used for a different request',
        );
      }
      if (saved?.responseStatus != null) return saved;
      await new Promise<void>((resolve) =>
        setTimeout(resolve, Math.min(POLL_MS, Math.max(0, deadline - Date.now()))),
      );
    }
    throw inProgress();
  }

  private async persist(
    owner: string,
    key: string,
    hash: string,
    response: Response,
    body: unknown,
    reservationId: string,
  ): Promise<unknown> {
    if (response.statusCode < 200 || response.statusCode >= 300) return body;
    // Snapshot exactly JSON data; do not persist headers, cookies or authentication material.
    const snapshot: unknown = JSON.parse(JSON.stringify(body ?? null));
    if (response.getHeader('set-cookie') !== undefined) {
      throw new Error('Credential-bearing responses cannot be made idempotent');
    }
    await this.store.complete(owner, key, hash, response.statusCode, snapshot, reservationId);
    return snapshot;
  }
}
