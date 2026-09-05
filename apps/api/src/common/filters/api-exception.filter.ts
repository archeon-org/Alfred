import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

const INTERNAL_SERVER_ERROR_STATUS = 500;

interface ErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string | readonly string[];
  };
  readonly success: false;
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
    const message =
      isHttpException && status < INTERNAL_SERVER_ERROR_STATUS
        ? safeHttpMessage(exception)
        : 'Internal server error';

    if (!isHttpException || status >= INTERNAL_SERVER_ERROR_STATUS) {
      this.logger.error(
        'Unhandled API exception',
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ErrorBody = Object.freeze({
      error: Object.freeze({ code: `HTTP_${status}`, message }),
      success: false,
    });
    response.status(status).json(body);
  }
}
