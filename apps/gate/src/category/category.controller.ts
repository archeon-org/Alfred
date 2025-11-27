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
import { CategoryService } from './category.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserEntity } from '@archeon-org/database';
import { Paginate, PaginateQuery } from 'nestjs-paginate';

@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  create(
    @Body() createCategoryDto: CreateCategoryDto,
    @CurrentUser() user: Partial<UserEntity>,
  ) {
    return this.categoryService.createCustom(createCategoryDto, user.id);
  }

  @Get()
  findAll(
    @CurrentUser() user: Partial<UserEntity>,
    @Paginate() query: PaginateQuery,
    @Query('hideEmpty') hideEmpty?: string,
  ) {
    return this.categoryService.findAll(user.id, query, hideEmpty === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: Partial<UserEntity>) {
    return this.categoryService.findOne(id, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @CurrentUser() user: Partial<UserEntity>,
  ) {
    return this.categoryService.update(id, updateCategoryDto, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: Partial<UserEntity>) {
    return this.categoryService.remove(id, user.id);
  }
}
