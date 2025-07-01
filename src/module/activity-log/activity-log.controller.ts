import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ParseQuery } from 'src/common/decorators/parse-query.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IActivityLogService } from './activity-log.interface';

@ApiTags('Activity Logs')
@ApiBearerAuth('JWT-auth')
@Controller('activity-logs')
@UseGuards(JwtAuthGuard)
export class ActivityLogController {
  constructor(
    @Inject('IActivityLogService')
    private readonly activityLogService: IActivityLogService,
  ) {}

  private checkAdminRole(req: any) {
    const user = req.user;
    if (!user || user.role !== 'admin') {
      throw new ForbiddenException('Only admin users can access activity logs');
    }
  }

  @Get()
  @ApiOperation({
    summary: 'Get all activity logs with pagination and filtering',
  })
  @ApiResponse({ status: 200, description: 'Returns paginated activity logs' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: 'number',
    description: 'Page number for pagination',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: 'number',
    description: 'Number of items per page',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by username or endpoint',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description: 'Field to sort by',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort order (asc or desc)',
  })
  @ApiQuery({
    name: 'start_date',
    required: false,
    description: 'Start date for filtering',
  })
  @ApiQuery({
    name: 'end_date',
    required: false,
    description: 'End date for filtering',
  })
  @ApiQuery({
    name: 'success',
    required: false,
    type: 'boolean',
    description: 'Filter by success status',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    description: 'Filter by user role',
  })
  @ApiQuery({
    name: 'resource',
    required: false,
    description: 'Filter by resource type',
  })
  async getAllLogs(@Request() req, @ParseQuery() query: Record<string, any>) {
    this.checkAdminRole(req);
    const { page = 1, limit = 10, ...otherQuery } = query;
    return this.activityLogService.getAllLogs(page, limit, otherQuery);
  }

  @Delete('/:id')
  @ApiOperation({ summary: 'Delete a specific activity log' })
  @ApiResponse({
    status: 200,
    description: 'Activity log deleted successfully',
  })
  async deleteLog(@Request() req, @Param('id') id: string) {
    this.checkAdminRole(req);
    return this.activityLogService.deleteLog(id);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete all activity logs' })
  @ApiResponse({
    status: 200,
    description: 'All activity logs deleted successfully',
  })
  async deleteAllLogs(@Request() req) {
    this.checkAdminRole(req);
    return this.activityLogService.deleteAllLogs();
  }
}
