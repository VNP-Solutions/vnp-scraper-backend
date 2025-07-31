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
import { CreateJobDto, ImportJobsResponseDto, UpdateJobDto } from './job.dto';
import { IJobService } from './job.interface';
import { createJobSchema } from './job.validation';

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
      'Search jobs by job ID, job name, portfolio name, sub-portfolio name, property name, Expedia ID, Booking ID, or Agoda ID',
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
}
