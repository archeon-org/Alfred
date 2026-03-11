import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

const unauthorizedDescription = 'Invalid or missing JWT token';
const forbiddenDescription = 'Insufficient permissions';

export function ApiPublicController(
  tag: string,
  description?: string,
): ClassDecorator {
  void description;
  return applyDecorators(ApiTags(tag));
}

export function ApiPrivateController(
  tag: string,
  description?: string,
): ClassDecorator {
  void description;
  return applyDecorators(
    ApiTags(tag),
    ApiBearerAuth('JWT-auth'),
    ApiUnauthorizedResponse({ description: unauthorizedDescription }),
  );
}

export function ApiAdminController(
  tag = 'admin',
  description = 'Administrative Operations',
): ClassDecorator {
  void description;
  return applyDecorators(
    ApiTags(tag),
    ApiBearerAuth('JWT-auth'),
    ApiUnauthorizedResponse({ description: unauthorizedDescription }),
    ApiForbiddenResponse({ description: forbiddenDescription }),
  );
}
