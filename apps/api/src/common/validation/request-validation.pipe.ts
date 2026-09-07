import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

// Reserved for failures produced by the pure, pre-handler DTO validation boundary.
export class RequestValidationException extends BadRequestException {}

export class RequestValidationPipe extends ValidationPipe {
  constructor() {
    super({
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      stopAtFirstError: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
      whitelist: true,
    });
  }

  override createExceptionFactory(): (errors?: ValidationError[]) => RequestValidationException {
    return (errors = []) => new RequestValidationException(this.flattenValidationErrors(errors));
  }
}
