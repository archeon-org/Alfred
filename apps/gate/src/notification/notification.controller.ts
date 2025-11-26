import { Controller, Get, Param, Req, Patch } from '@nestjs/common';
import { NotificationService } from './notification.service';

import { Request } from 'express';
import { UserEntity } from '../user/user.entity';
import { Paginate, PaginateQuery } from 'nestjs-paginate';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async getUserNotifications(
    @Req() req: Request,
    @Paginate() query: PaginateQuery,
  ) {
    const user = req.user as UserEntity;
    return this.notificationService.getUserNotifications(user.id, query);
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') id: string) {
    return this.notificationService.markAsRead(id);
  }

  @Patch('read-all')
  async markAllAsRead(@Req() req: Request) {
    const user = req.user as UserEntity;
    return this.notificationService.markAllAsRead(user.id);
  }
}
