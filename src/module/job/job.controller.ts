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
  BatchResponseDto,
  BulkBatchUpdateDto,
  BulkBatchUpdateResponseDto,
  CreateBatchDto,
  CreateJobDto,
  ImportJobsResponseDto,
  JobStatisticsResponseDto,
  UpdateBatchDto,
  UpdateJobDto,
} from './job.dto';
import { IJobService } from './job.interface';
import { createBatchSchema, createJobSchema } from './job.validation';

@ApiTags('Jobs')
@ApiBearerAuth('JWT-auth')
@Controller('/jobs')
export class JobController {
  constructor(
    @Inject('IJobService')
    private readonly jobService: IJobService,
    private readonly logger: Logger,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ValidateBody(createJobSchema)
  @ApiOperation({ summary: 'Create new job' })
  @ApiResponse({ status: 201, description: 'Job created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createJob(
    @Req() request: any,
    @Body() createJobDto: CreateJobDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const userId = request.user?.userId;
        const job = await this.jobService.createJob({
          ...createJobDto,
          user_id: userId,
        });
        return {
          statusCode: 201,
          message: 'Job created successfully',
          data: job,
        };
      },
      this.logger,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({ summary: 'Get all jobs' })
  @ApiResponse({ status: 200, description: 'Returns list of jobs' })
  @ApiQuery({
    name: 'search',
    required: false,
    description:
      'Search jobs by job ID, job name, portfolio name, sub-portfolio name, property name, batch name, Expedia ID, Booking ID, or Agoda ID',
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
    name: 'batch_id',
    required: false,
    description: 'Filter jobs by batch ID',
  })
  @ApiQuery({
    name: 'batch_name',
    required: false,
    description: 'Filter jobs by batch name (partial match)',
  })
  async getAllJobs(
    @ParseQuery() query: Record<string, any>,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.jobService.getAllJobs(query);
        return {
          statusCode: 200,
          message: 'Jobs retrieved successfully',
          data: result.data,
          metadata: result.metadata,
        };
      },
      this.logger,
    );
  }

  @Get('/statistics')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get job statistics',
    description:
      'Get job statistics including current counts and last 12 months data. Admin users get all jobs statistics, regular users get only their own jobs statistics.',
  })
  @ApiResponse({
    status: 200,
    description: 'Job statistics retrieved successfully',
    type: JobStatisticsResponseDto,
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: {
          type: 'string',
          example: 'Job statistics retrieved successfully',
        },
        data: {
          type: 'object',
          properties: {
            currentCounts: {
              type: 'object',
              properties: {
                pending: {
                  type: 'object',
                  properties: {
                    count: { type: 'number', example: 15 },
                    percentage: { type: 'number', example: 25.5 },
                  },
                },
                failed: {
                  type: 'object',
                  properties: {
                    count: { type: 'number', example: 3 },
                    percentage: { type: 'number', example: 5.1 },
                  },
                },
                running: {
                  type: 'object',
                  properties: {
                    count: { type: 'number', example: 8 },
                    percentage: { type: 'number', example: 13.6 },
                  },
                },
                completed: {
                  type: 'object',
                  properties: {
                    count: { type: 'number', example: 45 },
                    percentage: { type: 'number', example: 76.3 },
                  },
                },
                stopped: {
                  type: 'object',
                  properties: {
                    count: { type: 'number', example: 2 },
                    percentage: { type: 'number', example: 3.4 },
                  },
                },
                total: { type: 'number', example: 73 },
              },
            },
            monthlyStats: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  month: { type: 'string', example: '2024-01' },
                  pending: {
                    type: 'object',
                    properties: {
                      count: { type: 'number', example: 12 },
                      percentage: { type: 'number', example: 22.2 },
                    },
                  },
                  failed: {
                    type: 'object',
                    properties: {
                      count: { type: 'number', example: 2 },
                      percentage: { type: 'number', example: 3.7 },
                    },
                  },
                  running: {
                    type: 'object',
                    properties: {
                      count: { type: 'number', example: 5 },
                      percentage: { type: 'number', example: 9.3 },
                    },
                  },
                  completed: {
                    type: 'object',
                    properties: {
                      count: { type: 'number', example: 35 },
                      percentage: { type: 'number', example: 64.8 },
                    },
                  },
                  stopped: {
                    type: 'object',
                    properties: {
                      count: { type: 'number', example: 0 },
                      percentage: { type: 'number', example: 0.0 },
                    },
                  },
                  total: { type: 'number', example: 54 },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Valid JWT token required',
  })
  async getJobStatistics(@Req() request: any, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const userId = request.user?.userId;
        const userRole = request.user?.role;

        if (!userId) {
          return {
            statusCode: 401,
            message: 'User not authenticated',
            data: null,
          };
        }

        const statistics = await this.jobService.getJobStatistics(
          userId,
          userRole,
        );

        return {
          statusCode: 200,
          message: 'Job statistics retrieved successfully',
          data: statistics,
        };
      },
      this.logger,
    );
  }

  @Get('/batches')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all batches' })
  @ApiResponse({
    status: 200,
    description: 'Returns list of batches',
    type: [BatchResponseDto],
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search batches by name or ID',
  })
  async getAllBatches(
    @ParseQuery() query: Record<string, any>,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const batches = await this.jobService.getAllBatches(query);
        return {
          statusCode: 200,
          message: 'Batches retrieved successfully',
          data: batches,
        };
      },
      this.logger,
    );
  }

  @Get('/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get job by ID' })
  @ApiResponse({ status: 200, description: 'Returns job' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJobById(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const job = await this.jobService.getJobById(id);
        return {
          statusCode: 200,
          message: 'Job retrieved successfully',
          data: job,
        };
      },
      this.logger,
    );
  }

  @Put('/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update job by ID' })
  @ApiResponse({ status: 200, description: 'Job updated successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async updateJob(
    @Param('id') id: string,
    @Body() updateJobDto: UpdateJobDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const job = await this.jobService.updateJob(id, updateJobDto);
        return {
          statusCode: 200,
          message: 'Job updated successfully',
          data: job,
        };
      },
      this.logger,
    );
  }

  @Delete('/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete job by ID' })
  @ApiResponse({ status: 200, description: 'Job deleted successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async deleteJob(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        await this.jobService.deleteJob(id);
        return {
          statusCode: 200,
          message: 'Job deleted successfully',
          data: null,
        };
      },
      this.logger,
    );
  }

  @Get('/:jobId/latest-checkout-date')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get latest checkout date for a job',
    description:
      'Returns the most recent checkout date from job items belonging to a specific job',
  })
  @ApiResponse({
    status: 200,
    description: 'Latest checkout date retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: {
          type: 'string',
          example: 'Latest checkout date retrieved successfully',
        },
        data: {
          type: 'object',
          properties: {
            check_out_date: {
              type: 'string',
              format: 'date-time',
              example: '2025-12-31T10:00:00.000Z',
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'No checkout dates found for this job',
  })
  async getLatestCheckoutDateByJobId(
    @Param('jobId') jobId: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result =
          await this.jobService.getLatestCheckoutDateByJobId(jobId);

        if (!result) {
          return {
            statusCode: 404,
            message: 'No checkout dates found for this job',
            data: null,
          };
        }

        return {
          statusCode: 200,
          message: 'Latest checkout date retrieved successfully',
          data: result,
        };
      },
      this.logger,
    );
  }

  @Post('/import')
  @ApiOperation({
    summary: 'Import jobs from Excel file',
    description:
      'Upload an Excel file to import jobs. The Excel file should contain columns: Portfolio (optional, must exist), Sub Portfolio (optional, must exist), Property Name (optional, must exist), Job Name, Job Status, Posting Type, OTA Provider, Billing Type, Next Due Date, Remaining Direct Billed, Total Collectable, Total Amount Confirmed, Execution Type, Retries Attempted, Max Retries, Retry Delay MS, Priority, Job Backoff Length Loading, Job Backoff Length Selector, Queue Name, Worker Assigned, Batch Execution ID, Start Date, End Date, Log Link, Live URL. Note: Portfolios, sub-portfolios, and properties must exist in the system before importing jobs if specified.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Excel file for job import',
    type: 'multipart/form-data',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Excel file (.xlsx, .xls, .csv) containing job data',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Jobs imported successfully',
    type: ImportJobsResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid file or missing required columns',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(ExcelFileInterceptor)
  async importJobs(
    @Req() request: any,
    @UploadedFile() file: Express.Multer.File,
    @Res() response: Response,
  ) {
    const { user } = request;
    if (user.role !== 'admin') {
      return ResponseHandler.handler(
        response,
        async () => {
          return {
            statusCode: 403,
            message: 'You are not authorized to import jobs',
            data: null,
          };
        },
        this.logger,
      );
    }

    if (!file) {
      return ResponseHandler.handler(
        response,
        async () => {
          return {
            statusCode: 400,
            message: 'Excel file is required',
            data: null,
          };
        },
        this.logger,
      );
    }

    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.jobService.importJobsFromExcel(
          file,
          user.userId,
        );
        return {
          statusCode: 200,
          message: `Import completed successfully: ${result.jobsCreated} jobs created`,
          data: result,
        };
      },
      this.logger,
    );
  }

  @Post('/batches')
  @UseGuards(JwtAuthGuard)
  @ValidateBody(createBatchSchema)
  @ApiOperation({ summary: 'Create new batch' })
  @ApiResponse({
    status: 201,
    description: 'Batch created successfully',
    type: BatchResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createBatch(
    @Body() createBatchDto: CreateBatchDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const batch = await this.jobService.createBatch(createBatchDto);
        return {
          statusCode: 201,
          message: 'Batch created successfully',
          data: batch,
        };
      },
      this.logger,
    );
  }

  @Get('/batches/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get batch by ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns batch',
    type: BatchResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Batch not found' })
  async getBatchById(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const batch = await this.jobService.getBatchById(id);
        return {
          statusCode: 200,
          message: 'Batch retrieved successfully',
          data: batch,
        };
      },
      this.logger,
    );
  }

  @Put('/batches/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update batch by ID' })
  @ApiResponse({
    status: 200,
    description: 'Batch updated successfully',
    type: BatchResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Batch not found' })
  async updateBatch(
    @Param('id') id: string,
    @Body() updateBatchDto: UpdateBatchDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const batch = await this.jobService.updateBatch(id, updateBatchDto);
        return {
          statusCode: 200,
          message: 'Batch updated successfully',
          data: batch,
        };
      },
      this.logger,
    );
  }

  @Delete('/batches/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete batch by ID' })
  @ApiResponse({ status: 200, description: 'Batch deleted successfully' })
  @ApiResponse({ status: 404, description: 'Batch not found' })
  async deleteBatch(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        await this.jobService.deleteBatch(id);
        return {
          statusCode: 200,
          message: 'Batch deleted successfully',
          data: null,
        };
      },
      this.logger,
    );
  }

  @Post('/bulk_batch_update')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Bulk update jobs with batch ID' })
  @ApiResponse({
    status: 200,
    description: 'Jobs updated successfully',
    type: BulkBatchUpdateResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid input' })
  @ApiResponse({ status: 404, description: 'Batch not found' })
  async bulkBatchUpdate(
    @Body() bulkBatchUpdateDto: BulkBatchUpdateDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.jobService.bulkBatchUpdate(
          bulkBatchUpdateDto.job_ids,
          bulkBatchUpdateDto.batch_id,
        );
        return {
          statusCode: 200,
          message: 'Jobs updated successfully',
          data: result,
        };
      },
      this.logger,
    );
  }
}
