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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ParseQuery } from 'src/common/decorators/parse-query.decorator';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateRecurringJobDto,
  CreateRecurringJobFromJobDto,
  RecurringJobResponseDto,
  RecurringJobWithJobsResponseDto,
  UpdateRecurringJobDto,
  UpdateRecurringJobStatusDto,
} from './recurring-job.dto';
import { IRecurringJobService } from './recurring-job.interface';
import {
  createRecurringJobFromJobSchema,
  createRecurringJobSchema,
  updateRecurringJobSchema,
  updateRecurringJobStatusSchema,
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
  @ApiOperation({ summary: 'Create new recurring job' })
  @ApiResponse({
    status: 201,
    description: 'Recurring job created successfully',
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

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({ summary: 'Get all recurring jobs' })
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
  @ApiOperation({ summary: 'Get recurring job by ID with all its jobs' })
  @ApiResponse({
    status: 200,
    description: 'Returns recurring job with jobs',
    type: RecurringJobWithJobsResponseDto,
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
}
