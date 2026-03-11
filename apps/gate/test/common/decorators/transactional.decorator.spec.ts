import 'reflect-metadata';
import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { Transactional } from 'src/common/decorators/transactional.decorator';
import { TransactionInterceptor } from 'src/common/interceptors/transaction/transaction.interceptor';

describe('Transactional decorator', () => {
  it('applies the transaction interceptor', () => {
    class TestController {
      @Transactional()
      handler() {}
    }

    const interceptors =
      Reflect.getMetadata(
        INTERCEPTORS_METADATA,
        TestController.prototype.handler,
      ) || [];

    expect(interceptors).toContain(TransactionInterceptor);
  });
});
