import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsModule } from '../tenants/tenants.module';
import { ProjectsController } from './api/projects.controller';
import { ProjectsService } from './application/projects.service';
import { ProjectEntity } from './infrastructure/persistence/project.entity';

@Module({
  imports: [TenantsModule, TypeOrmModule.forFeature([ProjectEntity])],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
