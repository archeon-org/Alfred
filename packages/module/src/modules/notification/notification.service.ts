import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Expo, ExpoPushMessage } from "expo-server-sdk";
import { NotificationEntity, UserEntity } from "@archeon-org/database";
import { paginate, PaginateQuery, Paginated } from "nestjs-paginate";
import {
  NotificationType,
  shouldSendPushNotification,
} from "@archeon-org/types";

export interface CreateNotificationDto {
  title: string;
  message: string;
  userId: string;
  redirect?: string;
  data?: any;
  /** Type of notification for preference checking */
  type?: NotificationType;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private expo = new Expo();

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationRepository: Repository<NotificationEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>
  ) {}

  async create(
    createNotificationDto: CreateNotificationDto
  ): Promise<NotificationEntity | null> {
    const notificationType =
      createNotificationDto.type || NotificationType.SYSTEM;

    this.logger.log(
      `Creating notification for user ${createNotificationDto.userId} (type: ${notificationType})`
    );

    // Fetch user to check preferences
    const user = await this.userRepository.findOne({
      where: { id: createNotificationDto.userId },
    });

    if (!user) {
      this.logger.warn(
        `User ${createNotificationDto.userId} not found. Notification skipped.`
      );
      return null;
    }

    // Check if notification should be sent based on user preferences
    const shouldSend = shouldSendPushNotification(
      user.preferences,
      notificationType
    );

    if (!shouldSend) {
      this.logger.log(
        `User ${createNotificationDto.userId} has disabled ${notificationType} notifications. Skipping.`
      );
      return null;
    }

    // Create notification in database
    const notification = this.notificationRepository.create({
      title: createNotificationDto.title,
      message: createNotificationDto.message,
      userId: createNotificationDto.userId,
      redirect: createNotificationDto.redirect,
      isRead: false,
    });

    await this.notificationRepository.save(notification);

    // Send push notification
    await this.sendPushNotification(
      user,
      createNotificationDto.title,
      createNotificationDto.message,
      { ...createNotificationDto.data, notificationId: notification.id }
    );

    return notification;
  }

  /**
   * Send push notification to a user
   * Can accept either a UserEntity (to avoid extra DB lookup) or a userId string
   */
  async sendPushNotification(
    userOrUserId: UserEntity | string,
    title: string,
    message: string,
    data?: any
  ) {
    let user: UserEntity | null;

    if (typeof userOrUserId === "string") {
      this.logger.log(
        `Attempting to send push notification to user ${userOrUserId}`
      );
      user = await this.userRepository.findOne({
        where: { id: userOrUserId },
      });
    } else {
      user = userOrUserId;
      this.logger.log(
        `Attempting to send push notification to user ${user.id}`
      );
    }

    if (!user || !user.pushToken) {
      this.logger.warn(
        `User ${typeof userOrUserId === "string" ? userOrUserId : userOrUserId.id} does not have a push token. Push notification skipped.`
      );
      return;
    }

    this.logger.log(`Found push token for user ${user.id}: ${user.pushToken}`);

    if (!Expo.isExpoPushToken(user.pushToken)) {
      this.logger.error(
        `Push token ${user.pushToken} is not a valid Expo push token`
      );
      return;
    }

    this.logger.log(`Push token is valid. Preparing to send notification...`);

    const messages: ExpoPushMessage[] = [];
    messages.push({
      to: user.pushToken,
      sound: "default",
      title,
      body: message,
      data,
      priority: "high",
      channelId: "default",
    });

    this.logger.log(`Message payload: ${JSON.stringify(messages[0], null, 2)}`);

    const chunks = this.expo.chunkPushNotifications(messages);
    const tickets = [];

    for (const chunk of chunks) {
      try {
        this.logger.log(`Sending push notification chunk...`);
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
        this.logger.log(`Push notification sent to user ${user.id}`);
        this.logger.log(
          `Ticket response: ${JSON.stringify(ticketChunk, null, 2)}`
        );
      } catch (error) {
        this.logger.error("Error sending push notification", error);
      }
    }

    return tickets;
  }

  async getUserNotifications(
    userId: string,
    query: PaginateQuery
  ): Promise<Paginated<NotificationEntity>> {
    this.logger.debug(`Fetching notifications for user ${userId}`);
    return paginate<NotificationEntity>(
      query,
      this.notificationRepository as any,
      {
        sortableColumns: ["id", "createdAt", "isRead"],
        nullSort: "last",
        defaultSortBy: [["createdAt", "DESC"]],
        searchableColumns: ["title", "message"],
        where: { userId },
      }
    );
  }

  async markAsRead(id: string): Promise<void> {
    this.logger.debug(`Marking notification ${id} as read`);
    await this.notificationRepository.update(id, { isRead: true });
  }

  async markAllAsRead(userId: string): Promise<void> {
    this.logger.log(`Marking all notifications as read for user ${userId}`);
    await this.notificationRepository.update({ userId }, { isRead: true });
  }

  async delete(id: string, userId: string): Promise<void> {
    this.logger.log(`Deleting notification ${id} for user ${userId}`);
    await this.notificationRepository.delete({ id, userId });
  }
}
