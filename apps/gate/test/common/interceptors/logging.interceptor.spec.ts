import { ExecutionContext } from '@nestjs/common';
import { of, throwError, lastValueFrom } from 'rxjs';
import { LoggingInterceptor } from 'src/common/interceptors/logging.interceptor';

describe('LoggingInterceptor', () => {
  const makeContext = () =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          url: '/api/search',
          body: { q: 'nest' },
          query: { mode: 'hybrid' },
          params: { id: 'abc' },
        }),
      }),
    }) as unknown as ExecutionContext;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs incoming and successful response', async () => {
    const interceptor = new LoggingInterceptor();
    const logger = (interceptor as any).logger;
    const logSpy = jest.spyOn(logger, 'log').mockImplementation();
    const debugSpy = jest.spyOn(logger, 'debug').mockImplementation();

    const stream = interceptor.intercept(makeContext(), {
      handle: () => of({ ok: true }),
    });

    await expect(lastValueFrom(stream)).resolves.toEqual({ ok: true });
    expect(logSpy).toHaveBeenCalledWith('Incoming Request: POST /api/search');
    expect(debugSpy).toHaveBeenCalledWith('Body: {"q":"nest"}');
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Response for POST /api/search'),
    );
  });

  it('logs errors on failed downstream handlers', async () => {
    const interceptor = new LoggingInterceptor();
    const logger = (interceptor as any).logger;
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation();
    const error = new Error('boom');

    const stream = interceptor.intercept(makeContext(), {
      handle: () => throwError(() => error),
    });

    await expect(lastValueFrom(stream)).rejects.toThrow('boom');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error for POST /api/search'),
      error.stack,
    );
  });
});
