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
import {
  ApiCategoryControllerDocs,
  ApiCreateSubfolderDocs,
  ApiCreateCategoryDocs,
  ApiDeleteCategoryDocs,
  ApiGetCategoryDocs,
  ApiListCategoriesDocs,
  ApiListCategoryTreeDocs,
  ApiListSubfoldersDocs,
  ApiUpdateCategoryDocs,
} from './category.docs';

@ApiCategoryControllerDocs()
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @ApiCreateCategoryDocs()
  create(
    @Body() createCategoryDto: CreateCategoryDto,
    @CurrentUser() user: Partial<UserEntity>,
  ) {
    return this.categoryService.createCustom(createCategoryDto, user.id);
  }

  @Get()
  @ApiListCategoriesDocs()
  findAll(
    @CurrentUser() user: Partial<UserEntity>,
    @Paginate() query: PaginateQuery,
    @Query('hideEmpty') hideEmpty?: string,
  ) {
    return this.categoryService.findAll(user.id, query, hideEmpty === 'true');
  }

  @Get('tree')
  @ApiListCategoryTreeDocs()
  findTree(
    @CurrentUser() user: Partial<UserEntity>,
    @Query('hideEmpty') hideEmpty?: string,
  ) {
    return this.categoryService.findTree(user.id, hideEmpty === 'true');
  }

  @Get(':id/subfolders')
  @ApiListSubfoldersDocs()
  findSubfolders(
    @Param('id') id: string,
    @CurrentUser() user: Partial<UserEntity>,
    @Query('hideEmpty') hideEmpty?: string,
  ) {
    return this.categoryService.findSubfolders(
      id,
      user.id,
      hideEmpty === 'true',
    );
  }

  @Post(':id/subfolders')
  @ApiCreateSubfolderDocs()
  createSubfolder(
    @Param('id') id: string,
    @Body() createCategoryDto: CreateCategoryDto,
    @CurrentUser() user: Partial<UserEntity>,
  ) {
    return this.categoryService.createSubfolder(id, createCategoryDto, user.id);
  }

  @Get(':id')
  @ApiGetCategoryDocs()
  findOne(@Param('id') id: string, @CurrentUser() user: Partial<UserEntity>) {
    return this.categoryService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiUpdateCategoryDocs()
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @CurrentUser() user: Partial<UserEntity>,
  ) {
    return this.categoryService.update(id, updateCategoryDto, user.id);
  }

  @Delete(':id')
  @ApiDeleteCategoryDocs()
  remove(@Param('id') id: string, @CurrentUser() user: Partial<UserEntity>) {
    return this.categoryService.remove(id, user.id);
  }
}
