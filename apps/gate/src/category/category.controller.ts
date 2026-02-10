import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { CategoryService } from './category.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserEntity } from '@archeon-org/database';
import { Paginate, PaginateQuery } from 'nestjs-paginate';

@ApiTags('categories')
@ApiBearerAuth('JWT-auth')
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @ApiOperation({
    summary: 'Create category',
    description: 'Creates a new custom category for the user.',
  })
  @ApiBody({ type: CreateCategoryDto })
  @ApiCreatedResponse({
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
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  create(
    @Body() createCategoryDto: CreateCategoryDto,
    @CurrentUser() user: Partial<UserEntity>,
  ) {
    return this.categoryService.createCustom(createCategoryDto, user.id);
  }

  @Get()
  @ApiOperation({
    summary: 'List categories',
    description: 'Retrieves paginated list of categories for the user.',
  })
  @ApiQuery({
    name: 'hideEmpty',
    description: 'Hide categories with no documents',
    required: false,
    type: 'boolean',
  })
  @ApiOkResponse({
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
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  findAll(
    @CurrentUser() user: Partial<UserEntity>,
    @Paginate() query: PaginateQuery,
    @Query('hideEmpty') hideEmpty?: string,
  ) {
    return this.categoryService.findAll(user.id, query, hideEmpty === 'true');
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get category by ID',
    description: 'Retrieves a single category.',
  })
  @ApiParam({
    name: 'id',
    description: 'Category UUID',
    type: 'string',
    format: 'uuid',
  })
  @ApiOkResponse({ description: 'Category details' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  findOne(@Param('id') id: string, @CurrentUser() user: Partial<UserEntity>) {
    return this.categoryService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update category',
    description: 'Updates a category. Only custom categories can be updated.',
  })
  @ApiParam({
    name: 'id',
    description: 'Category UUID',
    type: 'string',
    format: 'uuid',
  })
  @ApiBody({ type: UpdateCategoryDto })
  @ApiOkResponse({ description: 'Category updated successfully' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @CurrentUser() user: Partial<UserEntity>,
  ) {
    return this.categoryService.update(id, updateCategoryDto, user.id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete category',
    description:
      'Deletes a custom category. Default categories cannot be deleted.',
  })
  @ApiParam({
    name: 'id',
    description: 'Category UUID',
    type: 'string',
    format: 'uuid',
  })
  @ApiNoContentResponse({ description: 'Category deleted successfully' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  remove(@Param('id') id: string, @CurrentUser() user: Partial<UserEntity>) {
    return this.categoryService.remove(id, user.id);
  }
}
