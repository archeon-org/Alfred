import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenantsModule } from '../tenants/tenants.module';
import { SkillsController } from './api/skills.controller';
import { SkillsService } from './application/skills.service';
@Module({
  imports: [TenantsModule, ConfigModule],
  controllers: [SkillsController],
  providers: [SkillsService],
})
export class SkillsModule {}
