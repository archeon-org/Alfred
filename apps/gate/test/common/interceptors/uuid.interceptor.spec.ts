import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { UuidInterceptor } from 'src/common/interceptors/uuid.interceptor';

describe('UuidInterceptor', () => {
  const makeContext = (id?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          params: { id },
        }),
      }),
    }) as unknown as ExecutionContext;

  it('throws when id param is not a valid UUID', () => {
    const interceptor = new UuidInterceptor();

    expect(() =>
      interceptor.intercept(makeContext('invalid-id'), {
        handle: () => of('ok'),
      }),
    ).toThrow(BadRequestException);
  });

  it('passes through when id is valid', async () => {
    const interceptor = new UuidInterceptor();
    const stream = interceptor.intercept(
      makeContext('d290f1ee-6c54-4b01-90e6-d701748f0851'),
      {
        handle: () => of('ok'),
      },
    );

    await expect(lastValueFrom(stream)).resolves.toBe('ok');
  });

  it('passes through when id param is absent', async () => {
    const interceptor = new UuidInterceptor();
    const stream = interceptor.intercept(makeContext(undefined), {
      handle: () => of('ok'),
    });

    await expect(lastValueFrom(stream)).resolves.toBe('ok');
  });
});
