import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationModule as SharedNotificationModule } from '@archeon-org/module';

@Module({
  imports: [SharedNotificationModule],
  controllers: [NotificationController],
})
export class NotificationModule {}
