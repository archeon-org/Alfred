import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '@archeon-org/database';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionCronService } from './subscription.cron';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, SubscriptionCronService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
