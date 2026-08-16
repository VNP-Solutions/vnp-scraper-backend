import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ParseQuery } from 'src/common/decorators/parse-query.decorator';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateNotificationDto,
  NotificationQueryDto,
  ProtectedNotificationDto,
  PublicNotificationDto,
} from './notification.dto';
import { INotificationService } from './notification.interface';

@ApiTags('Notifications')
@ApiBearerAuth('JWT-auth')
@Controller('/notification')
export class NotificationController {
  constructor(
    @Inject('INotificationService')
    private readonly notificationService: INotificationService,
    private readonly logger: Logger,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a notification for a user' })
  @ApiResponse({
    status: 201,
    description: 'Notification created successfully',
  })
  @ApiBody({ type: CreateNotificationDto })
  async createNotification(
    @Body() data: CreateNotificationDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const notification =
          await this.notificationService.sendNotification(data);
        return {
          statusCode: 201,
          message: 'Notification created successfully',
          data: notification,
        };
      },
      this.logger,
    );
  }

  @Post('/public')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Send a public notification to all users' })
  @ApiResponse({
    status: 201,
    description: 'Public notifications sent successfully',
  })
  @ApiBody({ type: PublicNotificationDto })
  async createPublicNotification(
    @Body() data: PublicNotificationDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const notifications =
          await this.notificationService.sendPublicNotification(data);
        return {
          statusCode: 201,
          message: 'Public notifications sent successfully',
          data: notifications,
        };
      },
      this.logger,
    );
  }

  @Post('/protected')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Send a protected notification to specific users',
  })
  @ApiResponse({
    status: 201,
    description: 'Protected notifications sent successfully',
  })
  @ApiBody({ type: ProtectedNotificationDto })
  async createProtectedNotification(
    @Body() data: ProtectedNotificationDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const notifications =
          await this.notificationService.sendProtectedNotification(data);
        return {
          statusCode: 201,
          message: 'Protected notifications sent successfully',
          data: notifications,
        };
      },
      this.logger,
    );
  }

  @Get('/user/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get notifications for a user' })
  @ApiQuery({
    name: 'unreadOnly',
    required: false,
    type: Boolean,
    description: 'Filter to include only unread notifications',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description: 'Pagination cursor',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of notifications to retrieve',
  })
  @ApiResponse({
    status: 200,
    description: 'Notifications retrieved successfully',
  })
  async getUserNotifications(
    @Param('userId') userId: string,
    @ParseQuery() query: NotificationQueryDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.notificationService.getUserNotifications(
          userId,
          query,
        );
        return {
          statusCode: 200,
          message: 'Notifications retrieved successfully',
          data: result.notifications,
          metadata: {
            cursor: result.cursor || null,
          },
        };
      },
      this.logger,
    );
  }

  @Patch('/:notificationId/read')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiResponse({
    status: 200,
    description: 'Notification marked as read successfully',
  })
  async markNotificationAsRead(
    @Param('notificationId') notificationId: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const notification =
          await this.notificationService.markNotificationAsRead(notificationId);
        return {
          statusCode: 200,
          message: 'Notification marked as read successfully',
          data: notification,
        };
      },
      this.logger,
    );
  }

  @Patch('/user/:userId/read')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mark all notifications for a user as read' })
  @ApiResponse({
    status: 200,
    description: 'All notifications marked as read successfully',
  })
  async markAllNotificationsAsRead(
    @Param('userId') userId: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const count =
          await this.notificationService.markUserNotificationsAsRead(userId);
        return {
          statusCode: 200,
          message: 'All notifications marked as read successfully',
          data: {
            updated: count,
          },
        };
      },
      this.logger,
    );
  }
}
