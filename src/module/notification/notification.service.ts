import { Inject, Injectable, Logger } from '@nestjs/common';
import { Notification, NotificationType } from '@prisma/client';
import {
  CreateNotificationDto,
  NotificationQueryDto,
  ProtectedNotificationDto,
  PublicNotificationDto,
} from './notification.dto';
import {
  INotificationRepository,
  INotificationService,
} from './notification.interface';

@Injectable()
export class NotificationService implements INotificationService {
  constructor(
    @Inject('INotificationRepository')
    private readonly repository: INotificationRepository,
    private readonly logger: Logger,
  ) {}

  async sendNotification(data: CreateNotificationDto): Promise<Notification> {
    try {
      return await this.repository.createNotification(data);
    } catch (error) {
      this.logger.error(
        `sendNotification error: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async sendPublicNotification(
    data: PublicNotificationDto,
  ): Promise<Notification[]> {
    try {
      const userIds = await this.repository.getAllUserIds();
      if (!userIds.length) {
        return [];
      }
      return await this.repository.createNotificationsForUsers(userIds, {
        ...data,
        type: NotificationType.public,
      });
    } catch (error) {
      this.logger.error(
        `sendPublicNotification error: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async sendProtectedNotification(
    data: ProtectedNotificationDto,
  ): Promise<Notification[]> {
    try {
      if (!data.user_ids?.length) {
        return [];
      }
      return await this.repository.createNotificationsForUsers(data.user_ids, {
        title: data.title,
        message: data.message,
        metadata: data.metadata,
        type: NotificationType.protected,
      });
    } catch (error) {
      this.logger.error(
        `sendProtectedNotification error: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getUserNotifications(
    userId: string,
    query?: NotificationQueryDto,
  ): Promise<{ notifications: Notification[]; cursor?: string }> {
    try {
      return await this.repository.getNotificationsByUser(userId, query);
    } catch (error) {
      this.logger.error(
        `getUserNotifications error: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async markNotificationAsRead(notificationId: string): Promise<Notification> {
    try {
      return await this.repository.markAsRead(notificationId);
    } catch (error) {
      this.logger.error(
        `markNotificationAsRead error: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async markUserNotificationsAsRead(userId: string): Promise<number> {
    try {
      return await this.repository.markAllAsRead(userId);
    } catch (error) {
      this.logger.error(
        `markUserNotificationsAsRead error: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
