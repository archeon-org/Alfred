import { Injectable, Logger } from '@nestjs/common';
import { NotificationRepository } from './notification.repository';
import { CreateNotificationDto } from './dto/notification.dto';
import { NotificationEntity } from './notification.entity';
import { paginate, PaginateQuery, Paginated } from 'nestjs-paginate';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationRepo: Repository<NotificationEntity>,
    private readonly notificationRepository: NotificationRepository,
  ) {}

  async create(
    createNotificationDto: CreateNotificationDto,
  ): Promise<NotificationEntity> {
    this.logger.log(
      `Creating notification for user ${createNotificationDto.userId}`,
    );
    return this.notificationRepository.create(createNotificationDto);
  }

  async getUserNotifications(
    userId: string,
    query: PaginateQuery,
  ): Promise<Paginated<NotificationEntity>> {
    this.logger.debug(`Fetching notifications for user ${userId}`);
    return paginate<NotificationEntity>(query, this.notificationRepo as any, {
      sortableColumns: ['id', 'createdAt', 'isRead'],
      nullSort: 'last',
      defaultSortBy: [['createdAt', 'DESC']],
      searchableColumns: ['title', 'message'],
      where: { userId },
    });
  }

  async markAsRead(id: string): Promise<void> {
    this.logger.debug(`Marking notification ${id} as read`);
    return this.notificationRepository.markAsRead(id);
  }

  async markAllAsRead(userId: string): Promise<void> {
    this.logger.log(`Marking all notifications as read for user ${userId}`);
    return this.notificationRepository.markAllAsRead(userId);
  }
}
