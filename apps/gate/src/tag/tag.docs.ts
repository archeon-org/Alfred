import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { ApiPrivateController } from '../common/decorators/api-controller.decorator';
import { CreateTagDto } from './dto/create-tag.dto';

export function ApiTagControllerDocs(): ClassDecorator {
  return ApiPrivateController('tags', 'Document Tags');
}

export function ApiListTagsDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'List tags',
      description: 'Retrieves all tags for the user.',
    }),
    ApiOkResponse({
      description: 'List of tags',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            color: { type: 'string', nullable: true },
            isDefault: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    }),
  );
}

export function ApiCreateTagDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Create tag',
      description: 'Creates a new tag or returns existing tag with same name.',
    }),
    ApiBody({ type: CreateTagDto }),
    ApiCreatedResponse({
      description: 'Tag created or existing tag returned',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          color: { type: 'string', nullable: true },
          isDefault: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    }),
    ApiBadRequestResponse({ description: 'Invalid request payload' }),
  );
}
