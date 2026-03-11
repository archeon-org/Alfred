import { APP_GUARD } from '@nestjs/core';

describe('AppModule', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('declares imports and global guards', async () => {
    jest.doMock(
      'db/datasource',
      () => ({
        dataSourceOptions: {},
      }),
      { virtual: true },
    );

    const { AppModule } = await import('src/app.module');
    const imports = Reflect.getMetadata('imports', AppModule);
    const providers = Reflect.getMetadata('providers', AppModule);

    expect(imports).toEqual(expect.any(Array));
    expect(imports.length).toBeGreaterThan(5);
    const guardProviders = providers.filter(
      (provider: { provide?: unknown }) => provider.provide === APP_GUARD,
    );
    const guardNames = guardProviders.map(
      (provider: { useClass?: { name?: string } }) => provider.useClass?.name,
    );

    expect(guardNames).toEqual(
      expect.arrayContaining([
        'ThrottlerGuard',
        'JwtAuthGuard',
        'UserTypeGuard',
      ]),
    );
  });
});
