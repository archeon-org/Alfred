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
import { AuthorizedUser } from 'src/common/decorators/user-type.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserType } from '@archeon-org/types';
import { UserEntity } from '@archeon-org/database';
import { Paginate, PaginateQuery } from 'nestjs-paginate';

@Controller('templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Post(':id/apply')
  async apply(
    @Param('id') id: string,
    @CurrentUser() user: Partial<UserEntity>,
  ) {
    return this.templateService.applyTemplate(id, user.id);
  }

  @Post()
  @AuthorizedUser(UserType.ADMIN)
  create(@Body() createTemplateDto: CreateTemplateDto) {
    return this.templateService.create(createTemplateDto);
  }

  @Get()
  findAll(@Paginate() query: PaginateQuery) {
    return this.templateService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.templateService.findOne(id);
  }

  @Patch(':id')
  @AuthorizedUser(UserType.ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateTemplateDto: UpdateTemplateDto,
  ) {
    return this.templateService.update(id, updateTemplateDto);
  }

  @Delete(':id')
  @AuthorizedUser(UserType.ADMIN)
  remove(@Param('id') id: string) {
    return this.templateService.remove(id);
  }

  @Get(':id/categories')
  findCategories(@Param('id') id: string, @Paginate() query: PaginateQuery) {
    return this.templateService.findCategories(id, query);
  }
}
