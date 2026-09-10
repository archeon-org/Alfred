import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UserEntity } from './user.entity';
import { UserIdentityEntity } from './user-identity.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    WorkspacesModule,
    TenantsModule,
    TypeOrmModule.forFeature([UserEntity, UserIdentityEntity]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
