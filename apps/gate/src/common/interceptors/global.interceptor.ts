import { UuidInterceptor } from './uuid.interceptor';
import { LoggingInterceptor } from './logging.interceptor';

export const interceptors = [new UuidInterceptor(), new LoggingInterceptor()];
