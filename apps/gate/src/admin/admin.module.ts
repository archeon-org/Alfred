import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { UserEntity } from '@archeon-org/database';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity]), SubscriptionModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
