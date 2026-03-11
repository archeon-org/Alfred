import { Logger } from '@nestjs/common';

describe('main bootstrap', () => {
  const originalEnv = process.env;

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    process.env = originalEnv;
  });

  const setup = async (nodeEnv?: string, port?: string) => {
    process.env = {
      ...originalEnv,
      NODE_ENV: nodeEnv,
      PORT: port,
    };

    const app = {
      use: jest.fn(),
      enableCors: jest.fn(),
      setGlobalPrefix: jest.fn(),
      useGlobalInterceptors: jest.fn(),
      useGlobalPipes: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    };
    const createMock = jest.fn().mockResolvedValue(app);
    const helmetMock = jest.fn().mockReturnValue('helmet-middleware');
    const setupSwaggerMock = jest.fn();

    jest.doMock('@nestjs/core', () => ({
      NestFactory: {
        create: createMock,
      },
    }));
    jest.doMock('helmet', () => ({
      __esModule: true,
      default: helmetMock,
    }));
    jest.doMock('../src/app.module', () => ({
      AppModule: class AppModule {},
    }));
    jest.doMock('../src/common/interceptors/global.interceptor', () => ({
      interceptors: ['a', 'b'],
    }));
    jest.doMock('../src/common/swagger', () => ({
      setupSwagger: setupSwaggerMock,
    }));
    jest.spyOn(Logger, 'log').mockImplementation(() => undefined);

    await import('../src/main');
    await new Promise((resolve) => setImmediate(resolve));

    return {
      app,
      createMock,
      helmetMock,
      setupSwaggerMock,
    };
  };

  it('configures app in development mode', async () => {
    const { app, createMock, helmetMock, setupSwaggerMock } = await setup(
      'development',
      '3010',
    );

    expect(createMock).toHaveBeenCalled();
    expect(helmetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
      }),
    );
    expect(app.enableCors).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: true,
      }),
    );
    expect(app.setGlobalPrefix).toHaveBeenCalledWith('api');
    expect(app.useGlobalInterceptors).toHaveBeenCalledWith('a', 'b');
    expect(app.useGlobalPipes).toHaveBeenCalledWith(expect.anything());
    expect(setupSwaggerMock).toHaveBeenCalledWith(app);
    expect(app.listen).toHaveBeenCalledWith('3010');
  });

  it('configures app in production mode', async () => {
    const { app, helmetMock } = await setup('production', '3020');

    expect(helmetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentSecurityPolicy: undefined,
      }),
    );
    expect(app.enableCors).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: [
          'https://archeon.app',
          'https://www.archeon.app',
          'https://api.archeon.app',
        ],
      }),
    );
    expect(app.listen).toHaveBeenCalledWith('3020');
  });

  it('uses default port when PORT env is missing', async () => {
    const { app } = await setup('development');
    expect(app.listen).toHaveBeenCalledWith(3000);
  });
});
