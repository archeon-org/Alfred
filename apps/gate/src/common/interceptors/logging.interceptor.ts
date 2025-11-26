import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url, body, query, params } = req;
    const now = Date.now();

    this.logger.log(`Incoming Request: ${method} ${url}`);
    this.logger.debug(`Body: ${JSON.stringify(body)}`);
    this.logger.debug(`Query: ${JSON.stringify(query)}`);
    this.logger.debug(`Params: ${JSON.stringify(params)}`);

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            `Response for ${method} ${url} - ${Date.now() - now}ms`,
          );
          // Be careful logging large responses
          // this.logger.debug(`Response Data: ${JSON.stringify(data)}`);
        },
        error: (error) => {
          this.logger.error(
            `Error for ${method} ${url} - ${Date.now() - now}ms`,
            error.stack,
          );
        },
      }),
    );
  }
}
