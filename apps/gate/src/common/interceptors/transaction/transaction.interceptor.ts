import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, catchError, concatMap, finalize } from 'rxjs';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

export const ENTITY_MANAGER_KEY = 'ENTITY_MANAGER';

@Injectable()
export class TransactionInterceptor implements NestInterceptor {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<Request>();
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    req[ENTITY_MANAGER_KEY] = queryRunner.manager;

    return next.handle().pipe(
      concatMap(async (data) => {
        await queryRunner.commitTransaction();
        return data;
      }),

      catchError(async (e) => {
        await queryRunner.rollbackTransaction();
        throw e;
      }),

      finalize(async () => {
        await queryRunner.release();
      }),
    );
  }
}
