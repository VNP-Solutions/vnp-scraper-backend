import { Injectable, Logger } from '@nestjs/common';
import { Notification, NotificationType } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import {
  CreateNotificationDto,
  NotificationPayload,
  NotificationQueryDto,
} from './notification.dto';
import { INotificationRepository } from './notification.interface';

@Injectable()
export class NotificationRepository implements INotificationRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  async createNotification(data: CreateNotificationDto): Promise<Notification> {
    try {
      const notification = await this.db.notification.create({
        data: {
          user_id: data.user_id,
          title: data.title,
          message: data.message,
          type: data.type,
          metadata: data.metadata,
        },
      });
      return notification;
    } catch (error) {
      this.logger.error(
        `Notification creation failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getNotificationsByUser(
    userId: string,
    query?: NotificationQueryDto,
  ): Promise<{ notifications: Notification[]; cursor?: string }> {
    try {
      const take =
        query?.limit && Number.isInteger(query.limit) && query.limit > 0
          ? query.limit
          : 20;
      const baseWhere: Record<string, any> = {
        user_id: userId,
      };

      if (query?.unreadOnly) {
        baseWhere.is_read = false;
      }

      const notifications = await this.db.notification.findMany({
        where: baseWhere,
        take,
        ...(query?.cursor
          ? {
              skip: 1,
              cursor: {
                id: query.cursor,
              },
            }
          : {}),
        orderBy: {
          createdAt: 'desc',
        },
      });

      const nextCursor =
        notifications.length === take
          ? notifications[notifications.length - 1].id
          : null;

      return { notifications, cursor: nextCursor };
    } catch (error) {
      this.logger.error(
        `Fetching notifications failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async markAsRead(notificationId: string): Promise<Notification> {
    try {
      const notification = await this.db.notification.update({
        where: { id: notificationId },
        data: {
          is_read: true,
          readAt: new Date(),
        },
      });
      return notification;
    } catch (error) {
      this.logger.error(
        `Mark notification as read failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async markAllAsRead(userId: string): Promise<number> {
    try {
      const result = await this.db.notification.updateMany({
        where: {
          user_id: userId,
          is_read: false,
        },
        data: {
          is_read: true,
          readAt: new Date(),
        },
      });
      return result.count;
    } catch (error) {
      this.logger.error(
        `Mark all notifications as read failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async createNotificationsForUsers(
    userIds: string[],
    payload: NotificationPayload & { type: NotificationType },
  ): Promise<Notification[]> {
    const notifications: Notification[] = [];
    for (const userId of userIds) {
      const notification = await this.db.notification.create({
        data: {
          user_id: userId,
          title: payload.title,
          message: payload.message,
          type: payload.type,
          metadata: payload.metadata,
        },
      });
      notifications.push(notification);
    }
    return notifications;
  }

  async getAllUserIds(): Promise<string[]> {
    const users = await this.db.user.findMany({
      select: {
        id: true,
      },
    });
    const ids: string[] = [];
    for (const user of users) {
      ids.push(user.id);
    }
    return ids;
  }
}
