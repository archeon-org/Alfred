import { ConfigService } from '@nestjs/config';
import { createClient } from 'celery-node';
import { CELERY_CLIENT, CeleryModule } from 'src/celery/celery.module';

jest.mock('celery-node', () => ({
  createClient: jest.fn(),
}));

describe('CeleryModule', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const getFactory = () => {
    const providers = Reflect.getMetadata('providers', CeleryModule) as Array<{
      provide: string;
      useFactory: (configService: ConfigService) => unknown;
    }>;

    const provider = providers.find((item) => item.provide === CELERY_CLIENT);
    if (!provider) {
      throw new Error('CELERY_CLIENT provider not found');
    }
    return provider.useFactory;
  };

  it('builds redis URL with password', () => {
    (createClient as jest.Mock).mockReturnValue({ connected: true });
    const configService = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue: unknown) => {
          if (key === 'REDIS_HOST') return 'redis.internal';
          if (key === 'REDIS_PORT') return 6380;
          if (key === 'REDIS_PASSWORD') return 'secret';
          return defaultValue;
        }),
    } as unknown as ConfigService;

    const factory = getFactory();
    factory(configService);

    expect(createClient).toHaveBeenCalledWith(
      'redis://:secret@redis.internal:6380/0',
      'redis://:secret@redis.internal:6380/0',
    );
  });

  it('builds redis URL without password', () => {
    (createClient as jest.Mock).mockReturnValue({ connected: true });
    const configService = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue: unknown) => {
          if (key === 'REDIS_HOST') return 'localhost';
          if (key === 'REDIS_PORT') return 6379;
          if (key === 'REDIS_PASSWORD') return '';
          return defaultValue;
        }),
    } as unknown as ConfigService;

    const factory = getFactory();
    factory(configService);

    expect(createClient).toHaveBeenCalledWith(
      'redis://localhost:6379/0',
      'redis://localhost:6379/0',
    );
  });

  it('exposes async module destroy hook', async () => {
    const module = new CeleryModule({} as ConfigService);
    await expect(module.onModuleDestroy()).resolves.toBeUndefined();
  });
});
