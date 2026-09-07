import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiException } from '../errors/api.exception';
import { OwnedResourceNotFoundException } from '../ownership/owned-resource-not-found.exception';

const INTERNAL_SERVER_ERROR_STATUS = 500;

interface ErrorBody {
  readonly error: {
    readonly code: string;
    readonly details?: Readonly<Record<string, unknown>>;
    readonly message: string | readonly string[];
  };
  readonly success: false;
}

function safeOperationalDetails(
  exception: HttpException,
): Readonly<Record<string, { readonly status: 'down' | 'up' }>> | undefined {
  const body: unknown = exception.getResponse();
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const candidate = body as Record<string, unknown>;
  const details = candidate.details;
  if (candidate.status !== 'error' || typeof details !== 'object' || details === null) {
    return undefined;
  }

  const entries = Object.entries(details as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 16) return undefined;

  const safeEntries: Array<readonly [string, { readonly status: 'down' | 'up' }]> = [];
  for (const [name, value] of entries) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/u.test(name)) return undefined;
    if (typeof value !== 'object' || value === null) {
      return undefined;
    }
    const dependency = value as Record<string, unknown>;
    const dependencyStatus = dependency.status;
    if (
      Object.keys(dependency).length !== 1 ||
      (dependencyStatus !== 'down' && dependencyStatus !== 'up')
    ) {
      return undefined;
    }
    safeEntries.push([name, Object.freeze({ status: dependencyStatus })]);
  }

  return Object.freeze(Object.fromEntries(safeEntries));
}

function safeHttpMessage(exception: HttpException): string | readonly string[] {
  const body: unknown = exception.getResponse();
  if (typeof body === 'string') return body;
  if (typeof body !== 'object' || body === null || !('message' in body)) {
    return exception.message;
  }

  const message = body.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message) && message.every((item) => typeof item === 'string')) {
    return Object.freeze([...message]);
  }
  return exception.message;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : INTERNAL_SERVER_ERROR_STATUS;
    const operationalDetails = isHttpException ? safeOperationalDetails(exception) : undefined;
    const details =
      exception instanceof ApiException && status < INTERNAL_SERVER_ERROR_STATUS
        ? exception.details
        : operationalDetails;
    const message =
      isHttpException && status < INTERNAL_SERVER_ERROR_STATUS
        ? safeHttpMessage(exception)
        : 'Internal server error';

    const isExpectedOperationalOutage = status === 503 && operationalDetails !== undefined;
    if (
      !isHttpException ||
      (status >= INTERNAL_SERVER_ERROR_STATUS && !isExpectedOperationalOutage)
    ) {
      this.logger.error(
        'Unhandled API exception',
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ErrorBody = Object.freeze({
      error: Object.freeze({
        code:
          exception instanceof ApiException || exception instanceof OwnedResourceNotFoundException
            ? exception.code
            : `HTTP_${status}`,
        ...(details === undefined ? {} : { details }),
        message,
      }),
      success: false,
    });
    response.status(status).json(body);
  }
}
