import 'reflect-metadata';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import {
  ApiAdminController,
  ApiPrivateController,
  ApiPublicController,
} from 'src/common/decorators/api-controller.decorator';

describe('API controller decorators', () => {
  it('applies public controller metadata', () => {
    @ApiPublicController('public-tag')
    class PublicController {}

    expect(Reflect.getMetadata(DECORATORS.API_TAGS, PublicController)).toEqual([
      'public-tag',
    ]);
    expect(
      Reflect.getMetadata(DECORATORS.API_SECURITY, PublicController),
    ).toBeUndefined();
  });

  it('applies private controller metadata with bearer auth and 401 docs', () => {
    @ApiPrivateController('private-tag')
    class PrivateController {}

    const security = Reflect.getMetadata(
      DECORATORS.API_SECURITY,
      PrivateController,
    );
    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      PrivateController,
    );

    expect(Reflect.getMetadata(DECORATORS.API_TAGS, PrivateController)).toEqual(
      ['private-tag'],
    );
    expect(JSON.stringify(security)).toContain('JWT-auth');
    expect(JSON.stringify(responses)).toContain('Invalid or missing JWT token');
  });

  it('applies admin controller defaults with forbidden response docs', () => {
    @ApiAdminController()
    class AdminController {}

    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      AdminController,
    );

    expect(Reflect.getMetadata(DECORATORS.API_TAGS, AdminController)).toEqual([
      'admin',
    ]);
    expect(JSON.stringify(responses)).toContain('Insufficient permissions');
  });
});
