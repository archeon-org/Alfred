import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantEntity } from './tenant.entity';
import { TenantsService } from './tenants.service';

@Module({
  imports: [TypeOrmModule.forFeature([TenantEntity])],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
