import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ApiPrivateController } from '../common/decorators/api-controller.decorator';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

const categoryIdParam = {
  name: 'id',
  description: 'Category UUID',
  type: 'string',
  format: 'uuid',
};

export function ApiCategoryControllerDocs(): ClassDecorator {
  return ApiPrivateController('categories', 'Document Categories');
}

export function ApiCreateCategoryDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Create category',
      description: 'Creates a new custom category for the user.',
    }),
    ApiBody({ type: CreateCategoryDto }),
    ApiCreatedResponse({
      description: 'Category created successfully',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
          color: { type: 'string', nullable: true },
          icon: { type: 'string', nullable: true },
          isDefault: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    }),
    ApiBadRequestResponse({ description: 'Invalid request payload' }),
  );
}

export function ApiListCategoriesDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'List categories',
      description: 'Retrieves paginated list of categories for the user.',
    }),
    ApiQuery({
      name: 'hideEmpty',
      description: 'Hide categories with no documents',
      required: false,
      type: 'boolean',
    }),
    ApiOkResponse({
      description: 'Paginated list of categories',
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
                description: { type: 'string', nullable: true },
                color: { type: 'string', nullable: true },
                icon: { type: 'string', nullable: true },
                isDefault: { type: 'boolean' },
                documentCount: { type: 'number' },
              },
            },
          },
          meta: { type: 'object' },
          links: { type: 'object' },
        },
      },
    }),
  );
}

export function ApiListCategoryTreeDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'List category tree',
      description:
        'Returns the full category hierarchy (root folders with nested subfolders) for the user.',
    }),
    ApiQuery({
      name: 'hideEmpty',
      description: 'Hide empty folders (folders without documents)',
      required: false,
      type: 'boolean',
    }),
    ApiOkResponse({
      description: 'Hierarchical category tree',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            color: { type: 'string', nullable: true },
            icon: { type: 'string', nullable: true },
            parentId: { type: 'string', format: 'uuid', nullable: true },
            order: { type: 'number', nullable: true },
            documentCount: { type: 'number' },
            children: {
              type: 'array',
              items: { type: 'object' },
            },
          },
        },
      },
    }),
  );
}

export function ApiListSubfoldersDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'List subfolders',
      description: 'Returns direct subfolders for a given parent category.',
    }),
    ApiParam(categoryIdParam),
    ApiQuery({
      name: 'hideEmpty',
      description: 'Hide empty subfolders',
      required: false,
      type: 'boolean',
    }),
    ApiOkResponse({
      description: 'List of subfolders',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            color: { type: 'string', nullable: true },
            icon: { type: 'string', nullable: true },
            parentId: { type: 'string', format: 'uuid', nullable: true },
            order: { type: 'number', nullable: true },
            documentCount: { type: 'number' },
          },
        },
      },
    }),
    ApiNotFoundResponse({ description: 'Parent category not found' }),
  );
}

export function ApiCreateSubfolderDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Create subfolder',
      description: 'Creates a subfolder under a parent category.',
    }),
    ApiParam(categoryIdParam),
    ApiBody({ type: CreateCategoryDto }),
    ApiCreatedResponse({
      description: 'Subfolder created successfully',
    }),
    ApiBadRequestResponse({ description: 'Invalid hierarchy constraints' }),
    ApiNotFoundResponse({ description: 'Parent category not found' }),
  );
}

export function ApiGetCategoryDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Get category by ID',
      description: 'Retrieves a single category.',
    }),
    ApiParam(categoryIdParam),
    ApiOkResponse({ description: 'Category details' }),
    ApiNotFoundResponse({ description: 'Category not found' }),
  );
}

export function ApiUpdateCategoryDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Update category',
      description: 'Updates a category. Only custom categories can be updated.',
    }),
    ApiParam(categoryIdParam),
    ApiBody({ type: UpdateCategoryDto }),
    ApiOkResponse({ description: 'Category updated successfully' }),
    ApiNotFoundResponse({ description: 'Category not found' }),
    ApiBadRequestResponse({ description: 'Invalid request payload' }),
  );
}

export function ApiDeleteCategoryDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Delete category',
      description:
        'Deletes a custom category. Default categories cannot be deleted.',
    }),
    ApiParam(categoryIdParam),
    ApiNoContentResponse({ description: 'Category deleted successfully' }),
    ApiNotFoundResponse({ description: 'Category not found' }),
  );
}
