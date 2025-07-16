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
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JobQueueUrlStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { ValidateBody } from '../../common/decorators/validate.decorator';
import { ResponseHandler } from '../../common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  BookUrlRequestDto,
  BookUrlResponseDto,
  CreateJobQueueUrlDto,
  ErrorResponseDto,
  JobQueueUrlResponseDto,
  UpdateJobQueueUrlDto,
} from './job-queue-url.dto';
import { IJobQueueUrlService } from './job-queue-url.interface';
import {
  bookUrlSchema,
  createJobQueueUrlSchema,
  updateJobQueueUrlSchema,
} from './job-queue-url.validation';

@ApiTags('Job Queue URL Management')
@ApiBearerAuth('JWT-auth')
@Controller('/job-queue-url')
export class JobQueueUrlController {
  constructor(
    @Inject('IJobQueueUrlService')
    private readonly service: IJobQueueUrlService,
    private readonly logger: Logger,
  ) {}

  @Post('/')
  @ApiOperation({
    summary: 'Create a new job queue URL',
    description:
      'Add a new server URL to the job queue for scraping operations',
  })
  @ApiBody({ type: CreateJobQueueUrlDto })
  @ApiResponse({
    status: 201,
    description: 'URL created successfully',
    type: JobQueueUrlResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'URL already exists',
    type: ErrorResponseDto,
  })
  @ValidateBody(createJobQueueUrlSchema)
  @UseGuards(JwtAuthGuard)
  async createUrl(
    @Req() request: Request,
    @Body() body: CreateJobQueueUrlDto,
    @Res() res: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      return ResponseHandler.handler(
        res,
        async () => {
          return {
            statusCode: 403,
            message: 'You are not authorized to create a job queue URL',
            data: null,
          };
        },
        this.logger,
      );
    }
    return ResponseHandler.handler(
      res,
      async () => {
        const result = await this.service.createUrl(body);
        return {
          statusCode: 201,
          message: 'URL created successfully',
          data: result,
        };
      },
      this.logger,
    );
  }

  @Get('/')
  @ApiOperation({
    summary: 'Get all job queue URLs',
    description: 'Retrieve all server URLs in the job queue',
  })
  @ApiResponse({
    status: 200,
    description: 'URLs retrieved successfully',
    type: [JobQueueUrlResponseDto],
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
    type: ErrorResponseDto,
  })
  @UseGuards(JwtAuthGuard)
  async getAllUrls(@Res() res: Response) {
    return ResponseHandler.handler(
      res,
      async () => {
        const result = await this.service.getAllUrls();
        return {
          statusCode: 200,
          message: 'URLs retrieved successfully',
          data: result,
        };
      },
      this.logger,
    );
  }

  @Get('/available')
  @ApiOperation({
    summary: 'Get available job queue URLs',
    description: 'Retrieve all available server URLs for job assignment',
  })
  @ApiResponse({
    status: 200,
    description: 'Available URLs retrieved successfully',
    type: [JobQueueUrlResponseDto],
  })
  @UseGuards(JwtAuthGuard)
  async getAvailableUrls(@Res() res: Response) {
    return ResponseHandler.handler(
      res,
      async () => {
        const result = await this.service.getAvailableUrls();
        return {
          statusCode: 200,
          message: 'Available URLs retrieved successfully',
          data: result,
        };
      },
      this.logger,
    );
  }

  @Get('/statistics')
  @ApiOperation({
    summary: 'Get queue statistics',
    description: 'Get overview statistics of the job queue URLs',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  @UseGuards(JwtAuthGuard)
  async getStatistics(@Res() res: Response) {
    return ResponseHandler.handler(
      res,
      async () => {
        const result = await this.service.getQueueStatistics();
        return {
          statusCode: 200,
          message: 'Statistics retrieved successfully',
          data: result,
        };
      },
      this.logger,
    );
  }

  @Get('/status/:status')
  @ApiOperation({
    summary: 'Get URLs by status',
    description: 'Retrieve URLs filtered by their current status',
  })
  @ApiParam({
    name: 'status',
    required: true,
    enum: JobQueueUrlStatus,
    description: 'The status to filter by',
    example: JobQueueUrlStatus.Available,
  })
  @ApiResponse({
    status: 200,
    description: 'URLs retrieved successfully',
    type: [JobQueueUrlResponseDto],
  })
  @UseGuards(JwtAuthGuard)
  async getUrlsByStatus(
    @Param('status') status: JobQueueUrlStatus,
    @Res() res: Response,
  ) {
    return ResponseHandler.handler(
      res,
      async () => {
        const result = await this.service.getUrlsByStatus(status);
        return {
          statusCode: 200,
          message: `URLs with status '${status}' retrieved successfully`,
          data: result,
        };
      },
      this.logger,
    );
  }

  @Get('/:id')
  @ApiOperation({
    summary: 'Get job queue URL by ID',
    description: 'Retrieve a specific server URL by its ID',
  })
  @ApiParam({
    name: 'id',
    required: true,
    description: 'The URL ID',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiResponse({
    status: 200,
    description: 'URL retrieved successfully',
    type: JobQueueUrlResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'URL not found',
    type: ErrorResponseDto,
  })
  @UseGuards(JwtAuthGuard)
  async getUrlById(@Param('id') id: string, @Res() res: Response) {
    return ResponseHandler.handler(
      res,
      async () => {
        const result = await this.service.getUrlById(id);
        return {
          statusCode: 200,
          message: 'URL retrieved successfully',
          data: result,
        };
      },
      this.logger,
    );
  }

  @Put('/:id')
  @ApiOperation({
    summary: 'Update job queue URL',
    description: 'Update an existing server URL in the job queue',
  })
  @ApiParam({
    name: 'id',
    required: true,
    description: 'The URL ID',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiBody({ type: UpdateJobQueueUrlDto })
  @ApiResponse({
    status: 200,
    description: 'URL updated successfully',
    type: JobQueueUrlResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'URL not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'URL already exists or conflict',
    type: ErrorResponseDto,
  })
  @ValidateBody(updateJobQueueUrlSchema)
  @UseGuards(JwtAuthGuard)
  async updateUrl(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: UpdateJobQueueUrlDto,
    @Res() res: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      return ResponseHandler.handler(
        res,
        async () => {
          return {
            statusCode: 403,
            message: 'You are not authorized to update job queue URLs',
            data: null,
          };
        },
        this.logger,
      );
    }
    return ResponseHandler.handler(
      res,
      async () => {
        const result = await this.service.updateUrl(id, body);
        return {
          statusCode: 200,
          message: 'URL updated successfully',
          data: result,
        };
      },
      this.logger,
    );
  }

  @Delete('/:id')
  @ApiOperation({
    summary: 'Delete job queue URL',
    description: 'Remove a server URL from the job queue',
  })
  @ApiParam({
    name: 'id',
    required: true,
    description: 'The URL ID',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiResponse({
    status: 200,
    description: 'URL deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'URL not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Cannot delete URL that is in use',
    type: ErrorResponseDto,
  })
  @UseGuards(JwtAuthGuard)
  async deleteUrl(
    @Req() request: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      return ResponseHandler.handler(
        res,
        async () => {
          return {
            statusCode: 403,
            message: 'You are not authorized to delete job queue URLs',
            data: null,
          };
        },
        this.logger,
      );
    }
    return ResponseHandler.handler(
      res,
      async () => {
        await this.service.deleteUrl(id);
        return {
          statusCode: 200,
          message: 'URL deleted successfully',
          data: null,
        };
      },
      this.logger,
    );
  }

  @Post('/book')
  @ApiOperation({
    summary: 'Book an available URL for a job',
    description:
      'Assign an available server URL to a job. Returns error if all servers are busy.',
  })
  @ApiBody({ type: BookUrlRequestDto })
  @ApiResponse({
    status: 200,
    description: 'URL booking result',
    type: BookUrlResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid job ID',
    type: ErrorResponseDto,
  })
  @ValidateBody(bookUrlSchema)
  @UseGuards(JwtAuthGuard)
  async bookUrl(@Body() body: BookUrlRequestDto, @Res() res: Response) {
    return ResponseHandler.handler(
      res,
      async () => {
        const result = await this.service.bookAvailableUrl(body.jobId);
        return {
          statusCode: result.success ? 200 : 503,
          message: result.message,
          data: result.url || null,
        };
      },
      this.logger,
    );
  }

  @Post('/:id/release')
  @ApiOperation({
    summary: 'Release a booked URL',
    description:
      'Release a URL that was booked for a job, making it available again',
  })
  @ApiParam({
    name: 'id',
    required: true,
    description: 'The URL ID to release',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiResponse({
    status: 200,
    description: 'URL released successfully',
    type: JobQueueUrlResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'URL not found',
    type: ErrorResponseDto,
  })
  @UseGuards(JwtAuthGuard)
  async releaseUrl(@Param('id') id: string, @Res() res: Response) {
    return ResponseHandler.handler(
      res,
      async () => {
        const result = await this.service.releaseUrl(id);
        return {
          statusCode: 200,
          message: 'URL released successfully',
          data: result,
        };
      },
      this.logger,
    );
  }

  @Put('/:id/maintenance')
  @ApiOperation({
    summary: 'Set URL to maintenance mode',
    description:
      'Put a URL into maintenance mode (cannot be assigned to new jobs)',
  })
  @ApiParam({
    name: 'id',
    required: true,
    description: 'The URL ID',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiResponse({
    status: 200,
    description: 'URL set to maintenance successfully',
    type: JobQueueUrlResponseDto,
  })
  @UseGuards(JwtAuthGuard)
  async setMaintenance(
    @Req() request: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      return ResponseHandler.handler(
        res,
        async () => {
          return {
            statusCode: 403,
            message: 'You are not authorized to modify server status',
            data: null,
          };
        },
        this.logger,
      );
    }
    return ResponseHandler.handler(
      res,
      async () => {
        const result = await this.service.setUrlMaintenance(id);
        return {
          statusCode: 200,
          message: 'URL set to maintenance mode successfully',
          data: result,
        };
      },
      this.logger,
    );
  }

  @Put('/:id/offline')
  @ApiOperation({
    summary: 'Set URL to offline',
    description: 'Put a URL offline (unavailable for any operations)',
  })
  @ApiParam({
    name: 'id',
    required: true,
    description: 'The URL ID',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiResponse({
    status: 200,
    description: 'URL set to offline successfully',
    type: JobQueueUrlResponseDto,
  })
  @UseGuards(JwtAuthGuard)
  async setOffline(
    @Req() request: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      return ResponseHandler.handler(
        res,
        async () => {
          return {
            statusCode: 403,
            message: 'You are not authorized to modify server status',
            data: null,
          };
        },
        this.logger,
      );
    }
    return ResponseHandler.handler(
      res,
      async () => {
        const result = await this.service.setUrlOffline(id);
        return {
          statusCode: 200,
          message: 'URL set to offline successfully',
          data: result,
        };
      },
      this.logger,
    );
  }

  @Put('/:id/online')
  @ApiOperation({
    summary: 'Set URL to online',
    description: 'Bring a URL online and make it available for job assignment',
  })
  @ApiParam({
    name: 'id',
    required: true,
    description: 'The URL ID',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiResponse({
    status: 200,
    description: 'URL set to online successfully',
    type: JobQueueUrlResponseDto,
  })
  @UseGuards(JwtAuthGuard)
  async setOnline(
    @Req() request: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      return ResponseHandler.handler(
        res,
        async () => {
          return {
            statusCode: 403,
            message: 'You are not authorized to modify server status',
            data: null,
          };
        },
        this.logger,
      );
    }
    return ResponseHandler.handler(
      res,
      async () => {
        const result = await this.service.setUrlOnline(id);
        return {
          statusCode: 200,
          message: 'URL set to online successfully',
          data: result,
        };
      },
      this.logger,
    );
  }
}
