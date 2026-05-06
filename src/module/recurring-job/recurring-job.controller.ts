import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Put,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ParseQuery } from 'src/common/decorators/parse-query.decorator';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { ExcelFileInterceptor } from 'src/common/interceptors/excel-file.interceptor';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateRecurringJobDto,
  CreateRecurringJobFromJobDto,
  RecurringJobResponseDto,
  RecurringJobWithBucketsResponseDto,
  UpdateRecurringJobDto,
  UpdateRecurringJobStatusDto,
  BulkDeleteRecurringJobDto,
  UpdateAllJobsUnderRecurringJobDto,
  TransferRecurringJobsByDateDto,
} from './recurring-job.dto';
import { IRecurringJobService } from './recurring-job.interface';
import {
  createRecurringJobFromJobSchema,
  createRecurringJobSchema,
  updateRecurringJobSchema,
  updateRecurringJobStatusSchema,
  bulkDeleteRecurringJobSchema,
  updateAllJobsUnderRecurringJobSchema,
  transferRecurringJobsByDateSchema,
} from './recurring-job.validation';

@ApiTags('Recurring Jobs')
@ApiBearerAuth('JWT-auth')
@Controller('/recurring-jobs')
export class RecurringJobController {
  constructor(
    @Inject('IRecurringJobService')
    private readonly recurringJobService: IRecurringJobService,
    private readonly logger: Logger,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ValidateBody(createRecurringJobSchema)
  @ApiOperation({ summary: 'Create new recurring job with first report bucket and job' })
  @ApiResponse({
    status: 201,
    description: 'Recurring job created successfully with report bucket',
    type: RecurringJobResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createRecurringJob(
    @Req() request: any,
    @Body() createRecurringJobDto: CreateRecurringJobDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const userId = request.user?.userId;
        const result = await this.recurringJobService.createRecurringJob({
          ...createRecurringJobDto,
          user_id: userId,
        });
        return {
          statusCode: 201,
          message: 'Recurring job created successfully',
          data: result,
        };
      },
      this.logger,
    );
  }

  @Post('/from-job')
  @UseGuards(JwtAuthGuard)
  @ValidateBody(createRecurringJobFromJobSchema)
  @ApiOperation({ summary: 'Create recurring job from existing job' })
  @ApiResponse({
    status: 201,
    description: 'Recurring job created from existing job successfully',
    type: RecurringJobResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async createRecurringJobFromJob(
    @Body() createRecurringJobFromJobDto: CreateRecurringJobFromJobDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result =
          await this.recurringJobService.createRecurringJobFromJob(
            createRecurringJobFromJobDto,
          );
        return {
          statusCode: 201,
          message: 'Recurring job created from existing job successfully',
          data: result,
        };
      },
      this.logger,
    );
  }

  @Post('/import-excel')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(ExcelFileInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Excel file containing recurring jobs data',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Excel file (.xlsx, .xls)',
        },
      },
    },
  })
  @ApiOperation({ 
    summary: 'Import recurring jobs from Excel file',
    description: 'Upload an Excel file to import multiple recurring jobs. Required columns: Posting Type, Property Name, Expedia ID/Agoda ID/Booking ID, Billing Type, Recurring Date, Duration. Optional columns: Portfolio, Initial Recurring Date (or Initial Date) for creating historical jobs, and credential columns (Expedia Username/Password, Agoda Username/Password, Booking Username/Password).',
  })
  @ApiResponse({
    status: 201,
    description: 'Recurring jobs imported successfully',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 201 },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            recurringJobsCreated: { type: 'number' },
            recurringJobs: { type: 'array' },
            errors: { 
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  row: { type: 'number' },
                  error: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid file or data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async importRecurringJobsFromExcel(
    @UploadedFile() file: Express.Multer.File,
    @Req() request: any,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const userId = request.user?.userId;
        const result =
          await this.recurringJobService.importRecurringJobsFromExcel(
            file,
            userId,
          );
        return {
          statusCode: 201,
          message: `Successfully imported ${result.recurringJobsCreated} recurring job(s)${result.errors.length > 0 ? ` with ${result.errors.length} error(s)` : ''}`,
          data: result,
        };
      },
      this.logger,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({ summary: 'Get all recurring jobs' })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by recurring job ID, name (partial match, case-insensitive), or hotel_id',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: 'number',
    description: 'Page number for pagination (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: 'number',
    description: 'Number of items per page (default: 10)',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    type: 'string',
    description: 'Field to sort by (default: createdAt). Options: name, createdAt, updatedAt, schedule_date, duration',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort order (default: desc)',
  })
  @ApiQuery({
    name: 'is_active',
    required: false,
    type: 'boolean',
    description: 'Filter by active status (true/false)',
  })
  @ApiQuery({
    name: 'duration',
    required: false,
    type: 'number',
    description: 'Filter by duration in months (1-12)',
  })
  @ApiQuery({
    name: 'portfolio_id',
    required: false,
    type: 'string',
    description: 'Filter by portfolio ID',
  })
  @ApiQuery({
    name: 'property_id',
    required: false,
    type: 'string',
    description: 'Filter by property ID',
  })
  @ApiQuery({
    name: 'ota_provider',
    required: false,
    enum: ['Expedia', 'Booking', 'Agoda'],
    description: 'Filter by OTA provider',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns list of recurring jobs',
    type: [RecurringJobResponseDto],
  })
  async getAllRecurringJobs(
    @ParseQuery() query: Record<string, any>,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.recurringJobService.getAllRecurringJobs(
          query,
        );
        return {
          statusCode: 200,
          message: 'Recurring jobs retrieved successfully',
          data: result.data,
          metadata: result.metadata,
        };
      },
      this.logger,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Get recurring job by ID with all its buckets and jobs' })
  @ApiResponse({
    status: 200,
    description: 'Returns recurring job with report buckets and jobs',
    type: RecurringJobWithBucketsResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Recurring job not found' })
  async getRecurringJobById(
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const recurringJob =
          await this.recurringJobService.getRecurringJobById(id);
        return {
          statusCode: 200,
          message: 'Recurring job retrieved successfully',
          data: recurringJob,
        };
      },
      this.logger,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  @ValidateBody(updateRecurringJobSchema)
  @ApiOperation({
    summary: 'Update recurring job (schedule_date, name, or other fields)',
  })
  @ApiResponse({
    status: 200,
    description: 'Recurring job updated successfully',
    type: RecurringJobResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Recurring job not found' })
  async updateRecurringJob(
    @Param('id') id: string,
    @Body() updateRecurringJobDto: UpdateRecurringJobDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const recurringJob =
          await this.recurringJobService.updateRecurringJob(
            id,
            updateRecurringJobDto,
          );
        return {
          statusCode: 200,
          message: 'Recurring job updated successfully',
          data: recurringJob,
        };
      },
      this.logger,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/status')
  @ValidateBody(updateRecurringJobStatusSchema)
  @ApiOperation({
    summary:
      'Update recurring job status (activate/deactivate)',
  })
  @ApiResponse({
    status: 200,
    description: 'Recurring job status updated successfully',
    type: RecurringJobResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Recurring job not found' })
  async updateRecurringJobStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateRecurringJobStatusDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const recurringJob =
          await this.recurringJobService.updateRecurringJobStatus(
            id,
            updateStatusDto,
          );
        return {
          statusCode: 200,
          message: 'Recurring job status updated successfully',
          data: recurringJob,
        };
      },
      this.logger,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete recurring job' })
  @ApiResponse({
    status: 200,
    description: 'Recurring job deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Recurring job not found' })
  async deleteRecurringJob(
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const recurringJob =
          await this.recurringJobService.deleteRecurringJob(id);
        return {
          statusCode: 200,
          message: 'Recurring job deleted successfully',
          data: recurringJob,
        };
      },
      this.logger,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('/:id/buckets')
  @ApiOperation({ summary: 'Get all buckets for a recurring job with filters' })
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
    description: 'Field to sort by (default: bucket_number)',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort order (asc or desc, default: asc)',
  })
  @ApiQuery({
    name: 'bucket_number',
    required: false,
    type: 'number',
    description: 'Filter by specific bucket number',
  })
  @ApiQuery({
    name: 'job_status',
    required: false,
    description: 'Filter buckets by job status (Pending, Running, Completed, Failed)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of buckets with their jobs retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Recurring job not found' })
  async getBucketsByRecurringId(
    @Param('id') id: string,
    @ParseQuery() query: Record<string, any>,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.recurringJobService.getBucketsByRecurringId(id, query);
        return {
          statusCode: 200,
          message: 'Buckets retrieved successfully',
          data: result.data,
          metadata: result.metadata,
        };
      },
      this.logger,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('/bulk-delete')
  @ApiOperation({ summary: 'Bulk delete recurring jobs' })
  @ApiResponse({
    status: 200,
    description: 'Recurring jobs deleted successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ValidateBody(bulkDeleteRecurringJobSchema)
  async bulkDeleteRecurringJobs(
    @Body() body: BulkDeleteRecurringJobDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.recurringJobService.bulkDeleteRecurringJobs(body.ids);
        return {
          statusCode: 200,
          message: `Successfully deleted ${result.deletedCount} recurring job(s)`,
          data: result,
        };
      },
      this.logger,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('bucket/:bucketId/jobs')
  @ApiOperation({ summary: 'Get all jobs in a specific bucket' })
  @ApiResponse({
    status: 200,
    description: 'List of all jobs in the bucket retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Bucket not found' })
  async getBucketJobs(
    @Param('bucketId') bucketId: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const jobs = await this.recurringJobService.getBucketJobs(bucketId);
        return {
          statusCode: 200,
          message: 'Jobs retrieved successfully',
          data: jobs,
        };
      },
      this.logger,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/update-all-jobs')
  @ValidateBody(updateAllJobsUnderRecurringJobSchema)
  @ApiOperation({ 
    summary: 'Update all jobs under a recurring job',
    description: 'Can change job status from Failed to Pending and/or update the recurring date for all jobs. When recurring date is changed, the scheduler is also updated. At least one of the fields must be provided.'
  })
  @ApiResponse({
    status: 200,
    description: 'All jobs under recurring job updated successfully',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            updatedJobsCount: { type: 'number' },
            schedulerUpdated: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - No jobs found or invalid input' })
  @ApiResponse({ status: 404, description: 'Recurring job not found' })
  async updateAllJobsUnderRecurringJob(
    @Param('id') id: string,
    @Body() updateDto: UpdateAllJobsUnderRecurringJobDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.recurringJobService.updateAllJobsUnderRecurringJob(
          id,
          updateDto.change_failed_to_pending,
          updateDto.new_recurring_date,
        );
        return {
          statusCode: 200,
          message: 'All jobs under recurring job updated successfully',
          data: result,
        };
      },
      this.logger,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('/transfer-by-date')
  @ValidateBody(transferRecurringJobsByDateSchema)
  @ApiOperation({ 
    summary: 'Transfer all recurring jobs from one date to another',
    description: 'Finds all recurring jobs scheduled on the from_date and transfers them (including all their jobs) to the to_date. The scheduler is automatically updated for all active recurring jobs.'
  })
  @ApiResponse({
    status: 200,
    description: 'Recurring jobs transferred successfully',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            recurringJobsUpdated: { type: 'number', description: 'Number of recurring jobs transferred' },
            totalJobsUpdated: { type: 'number', description: 'Total number of jobs updated' },
            schedulerUpdated: { type: 'boolean', description: 'Whether scheduler was updated' },
            recurringJobs: { 
              type: 'array',
              description: 'List of transferred recurring jobs',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  jobCount: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - No recurring jobs found on from_date or dates are the same' })
  async transferRecurringJobsByDate(
    @Body() transferDto: TransferRecurringJobsByDateDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.recurringJobService.transferRecurringJobsByDate(
          transferDto.from_date,
          transferDto.to_date,
        );
        return {
          statusCode: 200,
          message: `Successfully transferred ${result.recurringJobsUpdated} recurring job(s) from ${transferDto.from_date} to ${transferDto.to_date}`,
          data: result,
        };
      },
      this.logger,
    );
  }
}
