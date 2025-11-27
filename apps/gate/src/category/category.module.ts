import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryEntity } from '@archeon-org/database';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { DocumentEntity } from '@archeon-org/database';

@Module({
  imports: [TypeOrmModule.forFeature([CategoryEntity, DocumentEntity])],
  controllers: [CategoryController],
  providers: [CategoryService],
  exports: [CategoryService],
})
export class CategoryModule {}
