import { HttpService } from '@nestjs/axios';
import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Inject,
  Logger,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ParseQuery } from '../../../common/decorators/parse-query.decorator';
import { ResponseHandler } from '../../../common/utils/response-handler';
import { BaseScraperController } from '../base-scraper.controller';
import { IScraperJobItemService } from '../scraper-job-item.interface';
import {
  PropertyRunJobRequestDto,
  PropertyRunJobResponseDto,
  ReservationRunJobRequestDto,
  ReservationRunJobResponseDto,
  ExpediaStopJobRequestDto,
  ExpediaStopJobResponseDto,
  ExpediaRerunFailedJobRequestDto,
  ExpediaRerunFailedJobResponseDto,
} from './expedia.dto';

import {
    AllJobItemsResponseDto,
    ErrorResponseDto,
    HealthResponseDto,
    PauseResumeStopResponseDto,
    ScrapingStatusResponseDto,
  } from '../scraper.dto';
  

@ApiTags('Expedia Scraper')
@Controller('/expedia')
export class ExpediaController extends BaseScraperController {
  constructor(
    httpService: HttpService,
    configService: ConfigService,
    @Inject('IScraperJobItemService')
    jobItemService: IScraperJobItemService,
  ) {
    super(httpService, configService, jobItemService);
  }

  protected getRunJobEndpoint(): string {
    return '/api/expedia/property-run-job';
  }

  protected getStopJobEndpoint(): string {
    return '/api/scraping/stop';
  }

  protected getRerunFailedJobEndpoint(): string {
    return '/api/expedia/rerun-failed-job';
  }

  protected getPlatformDownMessage(): string {
    return 'Expedia Job server is down';
  }

  // Platform-specific implementations for the generic interface
  async runJob(body: PropertyRunJobRequestDto): Promise<PropertyRunJobResponseDto> {
    const response = await this.forwardRequest(this.getRunJobEndpoint(), body);
    return response.data;
  }

  async stopJob(body: ExpediaStopJobRequestDto): Promise<ExpediaStopJobResponseDto> {
    const response = await this.forwardRequest(this.getStopJobEndpoint(), body);
    return response.data;
  }

  async rerunFailedJob(body: ExpediaRerunFailedJobRequestDto): Promise<ExpediaRerunFailedJobResponseDto> {
    const response = await this.forwardRequest(this.getRerunFailedJobEndpoint(), body);
    return response.data;
  }

  @Get('/')
  @ApiOperation({
    summary: 'Health check endpoint',
    description: 'Check if the server is running and accessible',
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

  @Get('/auth')
  @ApiOperation({
    summary: 'Initiate OAuth authentication',
    description:
      'Start the OAuth authentication flow for accessing Expedia services',
  })
  @ApiResponse({ status: 200, description: 'Authentication flow initiated' })
  @ApiResponse({
    status: 500,
    description: 'Authentication error',
    type: ErrorResponseDto,
  })
  async auth(@Req() req: Request, @Res() res: Response) {
    try {
      const response = await this.forwardGetRequest('/auth', req.headers, req.query);
      return this.sendResponse(res, response);
    } catch (error: any) {
      return this.sendErrorResponse(res, error, this.getPlatformDownMessage());
    }
  }

  @Get('/oauth2callback')
  @ApiOperation({
    summary: 'OAuth callback endpoint',
    description: 'Handle OAuth callback after user authentication',
  })
  @ApiQuery({
    name: 'code',
    required: true,
    description: 'Authorization code from OAuth provider',
    type: String,
  })
  @ApiQuery({
    name: 'state',
    required: false,
    description: 'State parameter for security',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'OAuth callback processed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid OAuth callback parameters',
    type: ErrorResponseDto,
  })
  async oauth2callback(@Req() req: Request, @Res() res: Response) {
    try {
      const response = await this.forwardGetRequest('/oauth2callback', req.headers, req.query);
      return this.sendResponse(res, response);
    } catch (error: any) {
      return this.sendErrorResponse(res, error, this.getPlatformDownMessage());
    }
  }

  @Get('/api/scraping/status')
  @ApiOperation({
    summary: 'Get current scraping status',
    description:
      'Retrieve the current state and progress of scraping operations',
  })
  @ApiResponse({
    status: 200,
    description: 'Scraping status retrieved successfully',
    type: ScrapingStatusResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Error retrieving scraping status',
    type: ErrorResponseDto,
  })
  async scrapingStatus(@Req() req: Request, @Res() res: Response) {
    try {
      const response = await this.forwardGetRequest('/api/scraping/status', req.headers, req.query);
      return this.sendResponse(res, response);
    } catch (error: any) {
      return this.sendErrorResponse(res, error, this.getPlatformDownMessage());
    }
  }

  @Post('/api/scraping/pause')
  @ApiOperation({
    summary: 'Pause current scraping job',
    description: 'Gracefully pause the currently running scraping job.',
  })
  @ApiResponse({
    status: 200,
    description: 'Scraping paused successfully',
    type: PauseResumeStopResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot pause scraping - no active job running',
    type: PauseResumeStopResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Error pausing scraping',
    type: ErrorResponseDto,
  })
  async scrapingPause(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: any,
  ) {
    try {
      const response = await this.forwardRequest('/api/scraping/pause', body);
      return this.sendResponse(res, response);
    } catch (error: any) {
      return this.sendErrorResponse(res, error, this.getPlatformDownMessage());
    }
  }

  @Post('/api/scraping/resume')
  @ApiOperation({
    summary: 'Resume paused scraping job',
    description:
      'Resume a previously paused scraping job from where it left off',
  })
  @ApiResponse({
    status: 200,
    description: 'Scraping resumed successfully',
    type: PauseResumeStopResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot resume scraping - no paused job found',
    type: PauseResumeStopResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Error resuming scraping',
    type: ErrorResponseDto,
  })
  async scrapingResume(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: any,
  ) {
    try {
      const response = await this.forwardRequest('/api/scraping/resume', body);
      return this.sendResponse(res, response);
    } catch (error: any) {
      return this.sendErrorResponse(res, error, this.getPlatformDownMessage());
    }
  }

  @Post('/api/scraping/stop')
  @ApiOperation({
    summary: 'Stop current scraping job',
    description: 'Completely stop the current scraping job.',
  })
  @ApiResponse({
    status: 200,
    description: 'Scraping stopped successfully',
    type: PauseResumeStopResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Error stopping scraping',
    type: ErrorResponseDto,
  })
  async scrapingStop(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: ExpediaStopJobRequestDto,
  ) {
    try {
      const result = await this.stopJob(body);
      return this.sendResponse(res, { status: 200, data: result });
    } catch (error: any) {
      return this.sendErrorResponse(res, error, this.getPlatformDownMessage());
    }
  }

  @Post('/api/expedia/property-run-job')
  @ApiOperation({
    summary: 'Start property scraping job',
    description:
      'Start a new property scraping job for the specified property ID, date range, and job ID',
  })
  @ApiBody({ type: PropertyRunJobRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Property scraping job completed successfully',
    type: PropertyRunJobResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Missing required parameters in request body',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Scraping job already running',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Error processing property search',
    type: ErrorResponseDto,
  })
  async propertyRunJob(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: PropertyRunJobRequestDto,
  ) {
    try {
      const result = await this.runJob(body);
      return this.sendResponse(res, { status: 200, data: result });
    } catch (error: any) {
      return this.sendErrorResponse(res, error, this.getPlatformDownMessage());
    }
  }

  @Post('/api/expedia/reservation-run-job')
  @ApiOperation({
    summary: 'Start reservation scraping job',
    description:
      'Start a new reservation scraping job for the specified reservations',
  })
  @ApiBody({ type: ReservationRunJobRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Reservation scraping job completed successfully',
    type: ReservationRunJobResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Missing or invalid reservations array',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Scraping job already running',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Error processing reservation search',
    type: ErrorResponseDto,
  })
  async reservationRunJob(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: ReservationRunJobRequestDto,
  ) {
    try {
      const response = await this.forwardRequest('/api/expedia/reservation-run-job', body);
      return this.sendResponse(res, response);
    } catch (error: any) {
      return this.sendErrorResponse(res, error, this.getPlatformDownMessage());
    }
  }

  @Post('/api/expedia/rerun-failed-job')
  @ApiOperation({
    summary: 'Rerun failed or partial failed job',
    description:
      'Rerun a job that has failed or partially completed. This endpoint specifically handles jobs with Failed or Partial status and resets them to run again.',
  })
  @ApiBody({ type: ExpediaRerunFailedJobRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Failed/partial job rerun completed successfully',
    type: ExpediaRerunFailedJobResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request or job not eligible for rerun',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Job not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Error processing job rerun',
    type: ErrorResponseDto,
  })
  async expediraRerunFailedJob(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: ExpediaRerunFailedJobRequestDto,
  ) {
    try {
      const result = await this.rerunFailedJob(body);
      return this.sendResponse(res, { status: 200, data: result });
    } catch (error: any) {
      return this.sendErrorResponse(res, error, this.getPlatformDownMessage());
    }
  }

  @Get('/api/jobs/:jobId/progress')
  @ApiOperation({
    summary: 'Get job progress',
    description:
      'Get detailed progress information for a specific job including scraped data statistics',
  })
  @ApiParam({
    name: 'jobId',
    required: true,
    description: 'The job ID to get progress for',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiResponse({
    status: 200,
    description: 'Job progress retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({ status: 500, description: 'Server error' })
  async jobProgress(
    @Req() req: Request,
    @Res() res: Response,
    @Param('jobId') jobId: string,
  ) {
    try {
      const response = await this.forwardGetRequest(`/api/jobs/${jobId}/progress`, req.headers, req.query);
      return this.sendResponse(res, response);
    } catch (error: any) {
      return this.sendErrorResponse(res, error, this.getPlatformDownMessage());
    }
  }

  @Get('/api/jobs/:jobId/items')
  @ApiOperation({
    summary: 'Get job items',
    description: 'Get scraped reservation data for a specific job',
  })
  @ApiParam({
    name: 'jobId',
    required: true,
    description: 'The job ID to get items for',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number for pagination',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of items to return per page',
    example: 10,
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    type: String,
    description:
      'Field to sort by (e.g., guest_name, reservation_id, createdAt, etc.)',
    example: 'createdAt',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    type: String,
    enum: ['asc', 'desc'],
    description: 'Sort order (asc or desc)',
    example: 'desc',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description:
      'Search by guest name or reservation ID (partial match, case-insensitive)',
  })
  @ApiQuery({
    name: 'reason_for_charge',
    required: false,
    type: String,
    description:
      'Filter by reason for charge (partial match, case-insensitive)',
  })
  @ApiResponse({ status: 200, description: 'Job items retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({ status: 500, description: 'Server error' })
  async jobItems(
    @ParseQuery() query: Record<string, any>,
    @Res() res: Response,
    @Param('jobId') jobId: string,
  ) {
    return ResponseHandler.handler(
      res,
      async () => {
        const result =
          await this.jobItemService.getJobItemsByJobIdWithPagination(
            jobId,
            query,
          );
        return {
          statusCode: 200,
          message: 'Job items retrieved successfully',
          data: result.data,
          metadata: result.metadata,
        };
      },
      new Logger('ScraperController'),
    );
  }

  @Get('/api/jobs/:jobId/all-items')
  @ApiOperation({
    summary: 'Get all job items',
    description:
      'Get all scraped reservation data for a specific job (no pagination or filtering)',
  })
  @ApiParam({
    name: 'jobId',
    required: true,
    description: 'The job ID to get all items for',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiResponse({
    status: 200,
    description: 'All job items retrieved successfully',
    type: AllJobItemsResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Job not found',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  async getAllJobItems(
    @Req() req: Request,
    @Res() res: Response,
    @Param('jobId') jobId: string,
  ) {
    try {
      const jobItems = await this.jobItemService.getAllJobItemsByJobId(jobId);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'All job items retrieved successfully',
        data: jobItems,
        metadata: {
          total: jobItems.length,
          jobId: jobId,
        },
      });
    } catch (error: any) {
      const status = error.message?.includes('not found')
        ? HttpStatus.NOT_FOUND
        : HttpStatus.INTERNAL_SERVER_ERROR;
      return res.status(status).json({
        success: false,
        message: error.message || 'Error retrieving job items',
        data: null,
        metadata: {
          total: 0,
          jobId: jobId,
        },
      });
    }
  }
}
