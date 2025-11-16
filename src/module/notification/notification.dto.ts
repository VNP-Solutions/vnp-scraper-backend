import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type NotificationScope = 'public' | 'private' | 'protected';

export interface NotificationPayload {
  title?: string;
  message: string;
  metadata?: Record<string, any>;
}

export class CreateNotificationDto {
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'User ID to send notification to',
  })
  user_id: string;

  @ApiPropertyOptional({
    example: 'New Message',
    description: 'Notification title',
  })
  title?: string;

  @ApiProperty({
    example: 'You have a new message',
    description: 'Notification message',
  })
  message: string;

  @ApiPropertyOptional({
    example: { key: 'value' },
    description: 'Additional metadata',
  })
  metadata?: Record<string, any>;

  @ApiPropertyOptional({
    enum: ['public', 'private', 'protected'],
    example: 'private',
    description: 'Notification type',
  })
  type?: NotificationScope;
}

export class PublicNotificationDto {
  @ApiPropertyOptional({
    example: 'System Maintenance',
    description: 'Notification title',
  })
  title?: string;

  @ApiProperty({
    example: 'System will be down for maintenance tonight',
    description: 'Notification message',
  })
  message: string;

  @ApiPropertyOptional({
    example: { maintenance_start: '2024-01-01T00:00:00Z' },
    description: 'Additional metadata',
  })
  metadata?: Record<string, any>;
}

export class ProtectedNotificationDto {
  @ApiProperty({
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    description: 'Array of user IDs to send notification to',
    type: [String],
  })
  user_ids: string[];

  @ApiPropertyOptional({
    example: 'Beta Access',
    description: 'Notification title',
  })
  title?: string;

  @ApiProperty({
    example: 'You have been granted beta access',
    description: 'Notification message',
  })
  message: string;

  @ApiPropertyOptional({
    example: { feature: 'beta_dashboard' },
    description: 'Additional metadata',
  })
  metadata?: Record<string, any>;
}

export class NotificationQueryDto {
  @ApiPropertyOptional({
    example: false,
    description: 'Filter to include only unread notifications',
  })
  unreadOnly?: boolean;

  @ApiPropertyOptional({
    example: '507f1f77bcf86cd799439011',
    description: 'Pagination cursor',
  })
  cursor?: string;

  @ApiPropertyOptional({
    example: 20,
    description: 'Number of notifications to retrieve',
  })
  limit?: number;
}
