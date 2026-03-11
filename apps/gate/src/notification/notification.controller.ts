import { Controller, Get, Param, Req, Patch, Delete } from '@nestjs/common';
import { NotificationService } from '@archeon-org/module';

import { Request } from 'express';
import { UserEntity } from '@archeon-org/database';
import { Paginate, PaginateQuery } from 'nestjs-paginate';
import {
  ApiDeleteNotificationDocs,
  ApiListNotificationsDocs,
  ApiMarkAllNotificationsReadDocs,
  ApiMarkNotificationReadDocs,
  ApiNotificationControllerDocs,
} from './notification.docs';

@ApiNotificationControllerDocs()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiListNotificationsDocs()
  async getUserNotifications(
    @Req() req: Request,
    @Paginate() query: PaginateQuery,
  ) {
    const user = req.user as UserEntity;
    return this.notificationService.getUserNotifications(user.id, query);
  }

  @Patch(':id/read')
  @ApiMarkNotificationReadDocs()
  async markAsRead(@Param('id') id: string) {
    return this.notificationService.markAsRead(id);
  }

  @Patch('read-all')
  @ApiMarkAllNotificationsReadDocs()
  async markAllAsRead(@Req() req: Request) {
    const user = req.user as UserEntity;
    return this.notificationService.markAllAsRead(user.id);
  }

  @Delete(':id')
  @ApiDeleteNotificationDocs()
  async deleteNotification(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as UserEntity;
    return this.notificationService.delete(id, user.id);
  }
}
