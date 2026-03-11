import { Logger } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import basicAuth from 'express-basic-auth';
import { setupSwagger } from 'src/common/swagger';

jest.mock('express-basic-auth', () => jest.fn(() => 'basic-auth-middleware'));

describe('setupSwagger', () => {
  const originalEnv = process.env;

  const createApp = () =>
    ({
      use: jest.fn(),
    }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(SwaggerModule, 'createDocument').mockReturnValue({} as any);
    jest.spyOn(SwaggerModule, 'setup').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('does nothing in production', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      PORT: '3333',
    };
    const app = createApp();

    setupSwagger(app);

    expect(app.use).not.toHaveBeenCalled();
    expect(SwaggerModule.createDocument).not.toHaveBeenCalled();
    expect(SwaggerModule.setup).not.toHaveBeenCalled();
  });

  it('disables docs in development when credentials are missing', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'development',
      DOCS_USER: '',
      DOCS_PASSWORD: '',
    };
    const app = createApp();

    setupSwagger(app);

    expect(app.use).not.toHaveBeenCalled();
    expect(basicAuth).not.toHaveBeenCalled();
    expect(SwaggerModule.createDocument).not.toHaveBeenCalled();
  });

  it('protects docs with basic auth in development when credentials exist', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'development',
      DOCS_USER: 'docs-user',
      DOCS_PASSWORD: 'docs-pass',
      PORT: '3005',
    };
    const app = createApp();

    setupSwagger(app);

    expect(basicAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        challenge: true,
        users: { 'docs-user': 'docs-pass' },
      }),
    );
    expect(app.use).toHaveBeenCalledWith(
      ['/docs', '/docs-json', '/docs-yaml'],
      'basic-auth-middleware',
    );
    expect(SwaggerModule.createDocument).toHaveBeenCalled();
    expect(SwaggerModule.setup).toHaveBeenCalledWith(
      'docs',
      app,
      {},
      expect.objectContaining({
        customSiteTitle: 'Archeon Gate API Documentation',
      }),
    );
  });

  it('sets up docs in local mode without auth', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'local',
      PORT: '3006',
    };
    const app = createApp();

    setupSwagger(app);

    expect(app.use).not.toHaveBeenCalled();
    expect(basicAuth).not.toHaveBeenCalled();
    expect(SwaggerModule.createDocument).toHaveBeenCalled();
    expect(SwaggerModule.setup).toHaveBeenCalledWith(
      'docs',
      app,
      {},
      expect.any(Object),
    );
  });
});
