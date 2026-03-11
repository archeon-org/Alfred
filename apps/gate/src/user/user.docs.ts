import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { ApiPrivateController } from '../common/decorators/api-controller.decorator';
import { UpdateUserDto } from './dto/user.dto';

export function ApiUserControllerDocs(): ClassDecorator {
  return ApiPrivateController('user', 'User Profile Management');
}

export function ApiGetMeDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Get current user',
      description: 'Retrieves the authenticated user profile.',
    }),
    ApiOkResponse({
      description: 'User profile',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          firstName: { type: 'string', nullable: true },
          lastName: { type: 'string', nullable: true },
          profilePicture: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    }),
  );
}

export function ApiUpdateMeDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Update current user',
      description: 'Updates the authenticated user profile.',
    }),
    ApiBody({ type: UpdateUserDto }),
    ApiOkResponse({
      description: 'Updated user profile',
    }),
    ApiBadRequestResponse({ description: 'Invalid request payload' }),
  );
}
