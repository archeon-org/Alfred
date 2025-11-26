import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationEntity } from './notification.entity';
import { NotificationRepository } from './notification.repository';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationEntity])],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationRepository],
  exports: [NotificationService],
})
export class NotificationModule {}
