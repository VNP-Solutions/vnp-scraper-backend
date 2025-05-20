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
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { CreateJobDto, UpdateJobDto } from './job.dto';
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
  @ApiOperation({ summary: 'Create new job' })
  @ApiResponse({ status: 201, description: 'Job created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ValidateBody(createJobSchema)
  async createJob(
    @Body() createJobDto: CreateJobDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const job = await this.jobService.createJob(createJobDto);
        return {
          statusCode: 201,
          message: 'Job created successfully',
          data: job,
        };
      },
      this.logger,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all jobs' })
  @ApiResponse({ status: 200, description: 'Returns list of jobs' })
  @ApiQuery({
    name: 'query',
    required: false,
    description: 'Search query to filter jobs',
    type: String
  })
  async getAllJobs(
    @Query('query') query: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const jobs = await this.jobService.getAllJobs(query);
        return {
          statusCode: 200,
          message: 'Jobs retrieved successfully',
          data: jobs,
        };
      },
      this.logger,
    );
  }

  @Get(':id')
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

  @Put(':id')
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

  @Delete(':id')
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
}