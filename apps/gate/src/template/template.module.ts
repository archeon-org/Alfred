import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplateEntity } from '@archeon-org/database';
import { TemplateTagEntity } from '@archeon-org/database';
import { TemplateCategoryEntity } from '@archeon-org/database';
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
