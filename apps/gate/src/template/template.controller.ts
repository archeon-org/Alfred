import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { TemplateService } from './template.service';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto';
import { AuthorizedUser } from '../common/decorators/user-type.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserType } from '@archeon-org/types';
import { UserEntity } from '@archeon-org/database';
import { Paginate, PaginateQuery } from 'nestjs-paginate';
import {
  ApiApplyTemplateDocs,
  ApiCreateTemplateDocs,
  ApiDeleteTemplateDocs,
  ApiGetTemplateDocs,
  ApiListTemplateCategoriesDocs,
  ApiListTemplatesDocs,
  ApiTemplateControllerDocs,
  ApiUpdateTemplateDocs,
} from './template.docs';

@ApiTemplateControllerDocs()
@Controller('templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Post(':id/apply')
  @ApiApplyTemplateDocs()
  async apply(
    @Param('id') id: string,
    @CurrentUser() user: Partial<UserEntity>,
  ) {
    return this.templateService.applyTemplate(id, user.id);
  }

  @Post()
  @AuthorizedUser(UserType.ADMIN)
  @ApiCreateTemplateDocs()
  create(@Body() createTemplateDto: CreateTemplateDto) {
    return this.templateService.create(createTemplateDto);
  }

  @Get()
  @ApiListTemplatesDocs()
  findAll(@Paginate() query: PaginateQuery) {
    return this.templateService.findAll(query);
  }

  @Get(':id')
  @ApiGetTemplateDocs()
  findOne(@Param('id') id: string) {
    return this.templateService.findOne(id);
  }

  @Patch(':id')
  @AuthorizedUser(UserType.ADMIN)
  @ApiUpdateTemplateDocs()
  update(
    @Param('id') id: string,
    @Body() updateTemplateDto: UpdateTemplateDto,
  ) {
    return this.templateService.update(id, updateTemplateDto);
  }

  @Delete(':id')
  @AuthorizedUser(UserType.ADMIN)
  @ApiDeleteTemplateDocs()
  remove(@Param('id') id: string) {
    return this.templateService.remove(id);
  }

  @Get(':id/categories')
  @ApiListTemplateCategoriesDocs()
  findCategories(@Param('id') id: string, @Paginate() query: PaginateQuery) {
    return this.templateService.findCategories(id, query);
  }
}
