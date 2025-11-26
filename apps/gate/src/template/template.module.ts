import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplateEntity } from './template.entity';
import { TemplateTagEntity } from './template-tag.entity';
import { TemplateCategoryEntity } from './template-category.entity';
import { CategoryModule } from '../category/category.module';
import { TagModule } from '../tag/tag.module';
import { UserModule } from '../user/user.module';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';
import { TemplateRepository } from './template.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TemplateEntity,
      TemplateTagEntity,
      TemplateCategoryEntity,
    ]),
    CategoryModule,
    TagModule,
    UserModule,
  ],
  controllers: [TemplateController],
  providers: [TemplateService, TemplateRepository],
  exports: [TemplateService],
})
export class TemplateModule {}
