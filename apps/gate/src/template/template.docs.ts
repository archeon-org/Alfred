import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { ApiPrivateController } from '../common/decorators/api-controller.decorator';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto';

const templateIdParam = {
  name: 'id',
  description: 'Template UUID',
  type: 'string',
  format: 'uuid',
};

const templateSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
    icon: { type: 'string', nullable: true },
    order: { type: 'number', nullable: true },
  },
};

export function ApiTemplateControllerDocs(): ClassDecorator {
  return ApiPrivateController('templates', 'Templates & Onboarding Presets');
}

export function ApiApplyTemplateDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Apply template',
      description:
        'Applies template categories and tags to the authenticated user and marks onboarding complete.',
    }),
    ApiParam(templateIdParam),
    ApiOkResponse({ description: 'Template applied successfully' }),
    ApiNotFoundResponse({ description: 'Template not found' }),
  );
}

export function ApiCreateTemplateDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Create template',
      description: 'Creates a new template. Admin-only endpoint.',
    }),
    ApiBody({ type: CreateTemplateDto }),
    ApiOkResponse({
      description: 'Template created successfully',
      schema: templateSchema,
    }),
    ApiForbiddenResponse({ description: 'Admin role is required' }),
    ApiBadRequestResponse({ description: 'Invalid request payload' }),
  );
}

export function ApiListTemplatesDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'List templates',
      description: 'Returns paginated list of templates.',
    }),
    ApiOkResponse({
      description: 'Paginated list of templates',
      schema: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: templateSchema,
          },
          meta: { type: 'object' },
          links: { type: 'object' },
        },
      },
    }),
  );
}

export function ApiGetTemplateDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Get template details',
      description: 'Returns a single template with categories and tags.',
    }),
    ApiParam(templateIdParam),
    ApiOkResponse({
      description: 'Template details',
      schema: templateSchema,
    }),
    ApiNotFoundResponse({ description: 'Template not found' }),
  );
}

export function ApiUpdateTemplateDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Update template',
      description: 'Updates a template. Admin-only endpoint.',
    }),
    ApiParam(templateIdParam),
    ApiBody({ type: UpdateTemplateDto }),
    ApiOkResponse({
      description: 'Template updated successfully',
      schema: templateSchema,
    }),
    ApiForbiddenResponse({ description: 'Admin role is required' }),
    ApiNotFoundResponse({ description: 'Template not found' }),
    ApiBadRequestResponse({ description: 'Invalid request payload' }),
  );
}

export function ApiDeleteTemplateDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Delete template',
      description: 'Deletes a template. Admin-only endpoint.',
    }),
    ApiParam(templateIdParam),
    ApiNoContentResponse({ description: 'Template deleted successfully' }),
    ApiForbiddenResponse({ description: 'Admin role is required' }),
    ApiNotFoundResponse({ description: 'Template not found' }),
  );
}

export function ApiListTemplateCategoriesDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'List template categories',
      description: 'Returns paginated categories attached to a template.',
    }),
    ApiParam(templateIdParam),
    ApiOkResponse({
      description: 'Paginated list of template categories',
      schema: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                icon: { type: 'string', nullable: true },
                color: { type: 'string', nullable: true },
                order: { type: 'number', nullable: true },
                level: { type: 'number', nullable: true },
                parentTemplateCategoryId: {
                  type: 'string',
                  format: 'uuid',
                  nullable: true,
                },
              },
            },
          },
          meta: { type: 'object' },
          links: { type: 'object' },
        },
      },
    }),
    ApiNotFoundResponse({ description: 'Template not found' }),
  );
}
