import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextService } from './request-context.service';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;
const TRACEPARENT_PATTERN = /^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/u;
const ZERO_TRACE_ID = '0'.repeat(32);
const ZERO_SPAN_ID = '0'.repeat(16);
const REQUEST_CONTEXT_INITIALIZED = Symbol('request-context-initialized');

type ContextRequest = Request & { [REQUEST_CONTEXT_INITIALIZED]?: true };

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function createTraceContext(incoming: string | undefined): {
  readonly spanId: string;
  readonly traceId: string;
  readonly traceparent: string;
} {
  const match = incoming?.match(TRACEPARENT_PATTERN);
  const incomingTraceId = match?.[1];
  const incomingFlags = match?.[3];
  const hasValidParent =
    incomingTraceId !== undefined &&
    incomingTraceId !== ZERO_TRACE_ID &&
    match?.[2] !== ZERO_SPAN_ID;
  const traceId = hasValidParent ? incomingTraceId : randomBytes(16).toString('hex');
  const spanId = randomBytes(8).toString('hex');
  const flags = hasValidParent ? incomingFlags : '01';

  return {
    spanId,
    traceId,
    traceparent: `00-${traceId}-${spanId}-${flags}`,
  };
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly context: RequestContextService) {}

  use(request: ContextRequest, response: Response, next: NextFunction): void {
    if (request[REQUEST_CONTEXT_INITIALIZED] === true) {
      next();
      return;
    }
    request[REQUEST_CONTEXT_INITIALIZED] = true;
    const incomingRequestId = firstHeader(request.headers['x-request-id']);
    const requestId =
      incomingRequestId !== undefined && REQUEST_ID_PATTERN.test(incomingRequestId)
        ? incomingRequestId
        : randomUUID();
    const trace = createTraceContext(firstHeader(request.headers.traceparent));

    response.setHeader('x-request-id', requestId);
    response.setHeader('traceparent', trace.traceparent);

    this.context.run({ requestId, ...trace }, next);
  }
}
