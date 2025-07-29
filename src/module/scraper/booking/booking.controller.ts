import { HttpService } from '@nestjs/axios';
import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { BaseScraperController } from '../base-scraper.controller';
import { IScraperJobItemService } from '../scraper-job-item.interface';
import { bookingRunJobSchema } from './booking.validation';
import {
  BookingRunJobRequestDto,
  BookingRunJobResponseDto,
} from './booking.dto';
import { 
  RerunFailedJobResponseDto,
  StopJobRequestDto,
  StopJobResponseDto,
  RerunFailedJobRequestDto
} from '../platform.dto';
import {
  ErrorResponseDto,
  HealthResponseDto,
} from '../scraper.dto';

@ApiTags('Booking Scraper')
@Controller('/booking')
export class BookingController extends BaseScraperController {
  constructor(
    httpService: HttpService,
    configService: ConfigService,
    @Inject('IScraperJobItemService')
    jobItemService: IScraperJobItemService,
  ) {
    super(httpService, configService, jobItemService);
  }

  protected getRunJobEndpoint(): string {
    return '/api/booking/run-job';
  }

  protected getStopJobEndpoint(): string {
    return '/api/booking/stop-job';
  }

  protected getRerunFailedJobEndpoint(): string {
    return '/api/booking/rerun-failed-job';
  }

  protected getPlatformDownMessage(): string {
    return 'Booking scraper server is down';
  }

  async runJob(body: BookingRunJobRequestDto): Promise<BookingRunJobResponseDto> {
    const validationResult = bookingRunJobSchema.safeParse(body);
    if (!validationResult.success) {
      throw new Error('Validation failed');
    }
    
    const response = await this.forwardRequest(this.getRunJobEndpoint(), validationResult.data);
    return response.data;
  }

  @Post('/api/booking/run-job')
  @ApiOperation({
    summary: 'Start booking scraping job',
    description: 'Start a new booking scraping job for specified portfolio/property and date range',
  })
  @ApiBody({ type: BookingRunJobRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Booking scraping job started successfully',
    type: BookingRunJobResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid payload or parameters',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
    type: ErrorResponseDto,
  })
  async bookingRunJob(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: BookingRunJobRequestDto,
  ) {
    try {
      const result = await this.runJob(body);
      return this.sendResponse(res, { status: 200, data: result });
    } catch (error: any) {
      return this.sendErrorResponse(res, error, this.getPlatformDownMessage());
    }
  }

  async stopJob(body: StopJobRequestDto): Promise<StopJobResponseDto> {
    if (!body.jobId) {
      throw new Error('Job ID is required');
    }
    
    const response = await this.forwardRequest(this.getStopJobEndpoint(), body, 30000);
    return response.data;
  }

  async rerunFailedJob(body: RerunFailedJobRequestDto): Promise<RerunFailedJobResponseDto> {
    // TODO - complete rerun logic
    if (!body.jobId || !body.startDate || !body.endDate) {
      throw new Error('Job ID, start date, and end date are required');
    }
    
    const response = await this.forwardRequest(this.getRerunFailedJobEndpoint(), body);
    return response.data;
  }

  @Get('/')
  @ApiOperation({
    summary: 'Health check endpoint',
    description: 'Check if the Booking scraper server is running and accessible',
  })
  @ApiResponse({
    status: 200,
    description: 'Server is running',
    type: HealthResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
    type: ErrorResponseDto,
  })
  async health(@Req() req: Request, @Res() res: Response) {
    try {
      const response = await this.forwardGetRequest('/', req.headers, req.query);
      return this.sendResponse(res, response);
    } catch (error: any) {
      return this.sendErrorResponse(res, error, this.getPlatformDownMessage());
    }
  }

  @Post('/api/booking/stop-job')
  @ApiOperation({
    summary: 'Stop booking scraping job',
    description: 'Stop a running booking scraping job and mark job items as cancelled',
  })
  @ApiBody({ type: StopJobRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Booking scraping job stopped successfully',
    type: StopJobResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid job ID or job not running',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Job not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
    type: ErrorResponseDto,
  })
  async bookingStopJob(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: StopJobRequestDto,
  ) {
    try {
      const result = await this.stopJob(body);
      return this.sendResponse(res, { status: 200, data: result });
    } catch (error: any) {
      return this.sendErrorResponse(res, error, 'Failed to stop booking scraping job');
    }
  }

  @Post('/api/booking/rerun-failed-job')
  @ApiOperation({
    summary: 'Rerun failed booking scraping job',
    description: 'Re-execute a failed or cancelled booking job, tracking retry attempts and updating records',
  })
  @ApiBody({ type: RerunFailedJobRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Failed booking job rerun completed successfully',
    type: RerunFailedJobResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid job ID, job not failed/cancelled, or max retries exceeded',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Job not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
    type: ErrorResponseDto,
  })
  async bookingRerunFailedJob(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: RerunFailedJobRequestDto,
  ) {
    try {
      const result = await this.rerunFailedJob(body);
      return this.sendResponse(res, { status: 200, data: result });
    } catch (error: any) {
      return this.sendErrorResponse(res, error, 'Failed to rerun failed booking scraping job');
    }
  }
}