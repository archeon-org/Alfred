import { interceptors } from 'src/common/interceptors/global.interceptor';
import { LoggingInterceptor } from 'src/common/interceptors/logging.interceptor';
import { UuidInterceptor } from 'src/common/interceptors/uuid.interceptor';

describe('global interceptors', () => {
  it('registers UUID then logging interceptors in order', () => {
    expect(interceptors).toHaveLength(2);
    expect(interceptors[0]).toBeInstanceOf(UuidInterceptor);
    expect(interceptors[1]).toBeInstanceOf(LoggingInterceptor);
  });
});
