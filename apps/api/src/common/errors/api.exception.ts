import { HttpException } from '@nestjs/common';

/** Details are public API data. Never include credentials or internal exception objects. */
export class ApiException extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(Object.freeze({ code, message, ...(details === undefined ? {} : { details }) }), status);
  }
}
