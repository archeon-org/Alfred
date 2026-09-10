import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** Runs before Nest maps SyntaxError.message into a public BadRequestException. */
export function bodyParserErrorMiddleware(
  error: unknown,
  _request: Request,
  _response: Response,
  next: NextFunction,
): void {
  if (error instanceof Error && 'type' in error) {
    if (error.type === 'entity.parse.failed')
      return next(new BadRequestException('Invalid JSON body.'));
    if (error.type === 'entity.too.large')
      return next(new PayloadTooLargeException('Request body is too large.'));
  }
  next(error);
}
