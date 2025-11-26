import { Inject, Injectable, Scope } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { BaseRepository } from '../common/interceptors/transaction/base-repository';
import { NotificationEntity } from './notification.entity';

@Injectable({ scope: Scope.REQUEST })
export class NotificationRepository extends BaseRepository {
  constructor(
    @InjectDataSource() dataSource: DataSource,
    @Inject(REQUEST) req: Request,
  ) {
    super(dataSource, req);
  }

  public async create(
    data: Partial<NotificationEntity>,
  ): Promise<NotificationEntity> {
    const notification = this.getRepository(NotificationEntity).create(data);
    return this.getRepository(NotificationEntity).save(notification);
  }

  public async findByUserId(userId: string): Promise<NotificationEntity[]> {
    return this.getRepository(NotificationEntity).find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  public async markAsRead(id: string): Promise<void> {
    await this.getRepository(NotificationEntity).update(id, { isRead: true });
  }

  public async markAllAsRead(userId: string): Promise<void> {
    await this.getRepository(NotificationEntity).update(
      { userId },
      { isRead: true },
    );
  }
}
