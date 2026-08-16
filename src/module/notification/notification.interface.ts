import { Notification } from '@prisma/client';
import {
  CreateNotificationDto,
  NotificationPayload,
  NotificationQueryDto,
  ProtectedNotificationDto,
  PublicNotificationDto,
} from './notification.dto';

export interface INotificationRepository {
  createNotification(data: CreateNotificationDto): Promise<Notification>;
  createNotificationsForUsers(
    userIds: string[],
    payload: NotificationPayload & { type: string },
  ): Promise<Notification[]>;
  getAllUserIds(): Promise<string[]>;
  getNotificationsByUser(
    userId: string,
    query?: NotificationQueryDto,
  ): Promise<{ notifications: Notification[]; cursor?: string }>;
  markAsRead(notificationId: string): Promise<Notification>;
  markAllAsRead(userId: string): Promise<number>;
}

export interface INotificationService {
  sendNotification(data: CreateNotificationDto): Promise<Notification>;
  sendPublicNotification(data: PublicNotificationDto): Promise<Notification[]>;
  sendProtectedNotification(
    data: ProtectedNotificationDto,
  ): Promise<Notification[]>;
  getUserNotifications(
    userId: string,
    query?: NotificationQueryDto,
  ): Promise<{ notifications: Notification[]; cursor?: string }>;
  markNotificationAsRead(notificationId: string): Promise<Notification>;
  markUserNotificationsAsRead(userId: string): Promise<number>;
}
