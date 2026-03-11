import { ExecutionContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { lastValueFrom, of, throwError } from 'rxjs';
import {
  ENTITY_MANAGER_KEY,
  TransactionInterceptor,
} from 'src/common/interceptors/transaction/transaction.interceptor';

describe('TransactionInterceptor', () => {
  const build = () => {
    const queryRunner = {
      manager: { id: 'tx-manager' },
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };

    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    } as unknown as DataSource;

    const interceptor = new TransactionInterceptor(dataSource);
    const request: Record<string, unknown> = {};
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    return { interceptor, context, request, queryRunner };
  };

  it('starts, commits and releases transaction on success', async () => {
    const { interceptor, context, request, queryRunner } = build();

    const stream = await interceptor.intercept(context, {
      handle: () => of('ok'),
    });

    await expect(lastValueFrom(stream)).resolves.toBe('ok');
    await Promise.resolve();

    expect(queryRunner.connect).toHaveBeenCalled();
    expect(queryRunner.startTransaction).toHaveBeenCalled();
    expect(request[ENTITY_MANAGER_KEY]).toBe(queryRunner.manager);
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });

  it('rolls back and releases transaction on downstream error', async () => {
    const { interceptor, context, queryRunner } = build();
    const error = new Error('failed');

    const stream = await interceptor.intercept(context, {
      handle: () => throwError(() => error),
    });

    await expect(lastValueFrom(stream)).rejects.toThrow('failed');
    await Promise.resolve();

    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });
});
