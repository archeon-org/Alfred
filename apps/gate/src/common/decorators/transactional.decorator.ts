import { UseInterceptors, applyDecorators } from '@nestjs/common';
import { TransactionInterceptor } from '../interceptors/transaction/transaction.interceptor';

export const Transactional = () =>
  applyDecorators(UseInterceptors(TransactionInterceptor));
