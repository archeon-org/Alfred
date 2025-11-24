import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import * as uuid from 'uuid';

@Injectable()
export class UuidInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const id = request.params.id;
    if (id && !uuid.validate(id)) {
      throw new BadRequestException('Invalid UUID');
    }
    return next.handle();
  }
}
