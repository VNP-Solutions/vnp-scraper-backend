import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ParseQuery } from 'src/common/decorators/parse-query.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IActivityLogExportService } from './activity-log-export.interface';

@ApiTags('Activity Log Exports')
@ApiBearerAuth('JWT-auth')
@Controller('activity-log-exports')
@UseGuards(JwtAuthGuard)
export class ActivityLogExportController {
  constructor(
    @Inject('IActivityLogExportService')
    private readonly activityLogExportService: IActivityLogExportService,
  ) {}

  private checkAdminRole(req: any) {
    const user = req.user;
    if (!user || user.role !== 'admin') {
      throw new ForbiddenException(
        'Only admin users can access activity log exports',
      );
    }
  }

  @Get()
  @ApiOperation({
    summary: 'Get all activity log exports with pagination',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated activity log exports',
  })
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
  async getAllExports(
    @Request() req,
    @ParseQuery() query: Record<string, any>,
  ) {
    this.checkAdminRole(req);
    const { page = 1, limit = 10, ...otherQuery } = query;
    return this.activityLogExportService.getAllExports(page, limit, otherQuery);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific activity log export' })
  @ApiResponse({
    status: 200,
    description: 'Returns the activity log export',
  })
  async getExportById(@Request() req, @Param('id') id: string) {
    this.checkAdminRole(req);
    return this.activityLogExportService.getExportById(id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download the JSON file from S3' })
  @ApiResponse({
    status: 200,
    description: 'Redirects to S3 URL for download',
  })
  async downloadExport(
    @Request() req,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    this.checkAdminRole(req);
    const exportRecord = await this.activityLogExportService.getExportById(id);
    return res.redirect(exportRecord.s3Url);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a specific activity log export' })
  @ApiResponse({
    status: 200,
    description: 'Activity log export deleted successfully',
  })
  async deleteExport(@Request() req, @Param('id') id: string) {
    this.checkAdminRole(req);
    return this.activityLogExportService.deleteExport(id);
  }
}
