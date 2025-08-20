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
import { firstValueFrom } from 'rxjs';
import { ParseQuery } from '../../common/decorators/parse-query.decorator';

import { ResponseHandler } from '../../common/utils/response-handler';
import { IJobService } from '../job/job.interface';
import { IScraperJobItemService } from './scraper-job-item.interface';
import {
  AllJobItemsResponseDto,
  ErrorResponseDto,
  HealthResponseDto,
  PauseResumeStopResponseDto,
  PropertyRunJobRequestDto,
  PropertyRunJobResponseDto,
  RerunFailedJobRequestDto,
  RerunFailedJobResponseDto,
  ReservationRunJobRequestDto,
  ReservationRunJobResponseDto,
  ScrapingStatusResponseDto,
} from './scraper.dto';

@ApiTags('Unified Scraper')
@Controller('/scraper')
export class ScraperController {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject('IScraperJobItemService')
    private readonly jobItemService: IScraperJobItemService,
    @Inject('IJobService')
    private readonly jobService: IJobService,
  ) {
    // No need for base URL anymore - using OTA-specific URLs
  }

  /**
   * Get primary scraper URL (defaults to Expedia server for general endpoints)
   */
  private getPrimaryScraperUrl(): string {
    const expediadUrl = this.configService.get<string>('EXPEDIA_SERVER_URL');
    if (expediadUrl) {
      return expediadUrl.startsWith('http://') ||
        expediadUrl.startsWith('https://')
        ? expediadUrl
        : `http://${expediadUrl}`;
    }

    // Fallback to other OTA URLs if Expedia is not configured
    const agodaUrl = this.configService.get<string>('AGODA_SERVER_URL');
    if (agodaUrl) {
      return agodaUrl.startsWith('http://') || agodaUrl.startsWith('https://')
        ? agodaUrl
        : `http://${agodaUrl}`;
    }

    const bookingUrl = this.configService.get<string>('BOOKING_SERVER_URL');
    if (bookingUrl) {
      return bookingUrl.startsWith('http://') ||
        bookingUrl.startsWith('https://')
        ? bookingUrl
        : `http://${bookingUrl}`;
    }

    // Final fallback
    return 'http://localhost:3001';
  }

  /**
   * Get scraper URL based on OTA provider
   */
  private getUrlByOtaProvider(otaProvider: string): string | null {
    let envKey: string;

    switch (otaProvider) {
      case 'Expedia':
        envKey = 'EXPEDIA_SERVER_URL';
        break;
      case 'Agoda':
        envKey = 'AGODA_SERVER_URL';
        break;
      case 'Booking':
        envKey = 'BOOKING_SERVER_URL';
        break;
      default:
        return null;
    }

    const url = this.configService.get<string>(envKey);
    if (!url) {
      return null;
    }

    // Add http:// protocol if missing
    return url.startsWith('http://') || url.startsWith('https://')
      ? url
      : `http://${url}`;
  }

  /**
   * Get API path based on OTA provider and job type
   */
  private getApiPathByOtaProvider(
    otaProvider: string,
    jobType: string = 'property-run-job',
  ): string {
    const baseApiPath = this.getBaseApiPath(otaProvider);

    // Special handling for Expedia based on EXPEDIA_MODE
    if (otaProvider === 'Expedia' && jobType === 'property-run-job') {
      const expediadMode = this.configService.get<string>('EXPEDIA_MODE');
      if (expediadMode === 'graphql') {
        return `${baseApiPath}/graphql-run-job`;
      }
      // Default to scraper mode for Expedia
      return `${baseApiPath}/property-run-job`;
    }

    return `${baseApiPath}/${jobType}`;
  }

  /**
   * Get base API path for OTA provider
   */
  private getBaseApiPath(otaProvider: string): string {
    switch (otaProvider) {
      case 'Expedia':
        return '/api/expedia';
      case 'Agoda':
        return '/api/agoda';
      case 'Booking':
        return '/api/booking';
      default:
        return '/api/expedia'; // Default to Expedia
    }
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
      const response = await firstValueFrom(
        this.httpService.get(`${this.getPrimaryScraperUrl()}/`, {
          headers: req.headers,
          params: req.query,
        }),
      );
      return res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error.response?.data || {
        message: 'Expedia Job server is down',
      };
      return res.status(status).json(data);
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
      const response = await firstValueFrom(
        this.httpService.get(`${this.getPrimaryScraperUrl()}/auth`, {
          headers: req.headers,
          params: req.query,
        }),
      );
      return res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error.response?.data || {
        message: 'Expedia Job server is down',
      };
      return res.status(status).json(data);
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
      const response = await firstValueFrom(
        this.httpService.get(`${this.getPrimaryScraperUrl()}/oauth2callback`, {
          headers: req.headers,
          params: req.query,
        }),
      );
      return res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error.response?.data || {
        message: 'Expedia Job server is down',
      };
      return res.status(status).json(data);
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
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.getPrimaryScraperUrl()}/api/scraping/status`,
          {
            headers: req.headers,
            params: req.query,
          },
        ),
      );
      return res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error.response?.data || {
        message: 'Expedia Job server is down',
      };
      return res.status(status).json(data);
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
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.getPrimaryScraperUrl()}/api/scraping/pause`,
          body,
          {
            headers: {
              // ...req.headers,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            timeout: 300000, // 5 minute timeout for long-running scraping jobs
          },
        ),
      );
      return res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error.response?.data || {
        message: 'Expedia Job server is down',
      };
      return res.status(status).json(data);
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
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.getPrimaryScraperUrl()}/api/scraping/resume`,
          body,
          {
            headers: {
              ...req.headers,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            timeout: 300000, // 5 minute timeout for long-running scraping jobs
          },
        ),
      );
      return res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error.response?.data || {
        message: 'Expedia Job server is down',
      };
      return res.status(status).json(data);
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
    @Body() body: any,
  ) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.getPrimaryScraperUrl()}/api/scraping/stop`,
          body,
          {
            headers: {
              // ...req.headers,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            timeout: 300000, // 5 minute timeout for long-running scraping jobs
          },
        ),
      );
      return res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error.response?.data || {
        message: 'Expedia Job server is down',
      };
      return res.status(status).json(data);
    }
  }

  @Post('/api/property-run-job')
  @ApiOperation({
    summary: 'Start unified property scraping job',
    description:
      'Start a new property scraping job for any OTA provider (Expedia, Agoda, Booking). The system automatically determines the OTA provider from the job record and routes to the appropriate scraper server. For Expedia, the EXPEDIA_MODE environment variable determines whether to use GraphQL (graphql-run-job) or regular scraper (property-run-job) endpoint.',
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
    status: 503,
    description: 'Scraper URL not configured for OTA provider',
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
    let selectedUrl: string | null = null;

    try {
      // Fetch job details to get OTA provider
      const job = await this.jobService.getJobById(body.jobId);
      const otaProvider = job.ota_provider || 'Expedia'; // Default to Expedia
      selectedUrl = this.getUrlByOtaProvider(otaProvider);

      if (!selectedUrl) {
        return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
          success: false,
          message: `No scraper URL configured for OTA provider: ${otaProvider}`,
          error: 'Scraper URL not configured',
        });
      }

      // Add the selected URL to the request body
      const enhancedBody = {
        ...body,
        scraperUrl: selectedUrl,
      };

      // Update job current URL
      setTimeout(async () => {
        if (selectedUrl) {
          await this.jobItemService.updateJobCurrentUrl(
            body.jobId,
            selectedUrl,
          );
        }
      }, 1000);

      // Get the correct API path based on OTA provider and mode
      const apiPath = this.getApiPathByOtaProvider(
        otaProvider,
        'property-run-job',
      );

      // Log which endpoint is being used for Expedia
      if (otaProvider === 'Expedia') {
        const expediadMode =
          this.configService.get<string>('EXPEDIA_MODE') || 'scraper';
        console.log(`Using Expedia ${expediadMode} mode: ${apiPath}`);
      }

      const response = await firstValueFrom(
        this.httpService.post(`${selectedUrl}${apiPath}`, enhancedBody, {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 300000, // 5 minute timeout for long-running scraping jobs
        }),
      );

      return res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error.response?.data || {
        message: 'Job server is down',
      };
      return res.status(status).json(data);
    }
  }

  @Post('/api/reservation-run-job')
  @ApiOperation({
    summary: 'Start unified reservation scraping job',
    description:
      'Start a new reservation scraping job for any OTA provider (Expedia, Agoda, Booking). The system automatically determines the OTA provider from the job record and routes to the appropriate scraper server.',
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
    status: 503,
    description: 'Scraper URL not configured for OTA provider',
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
    let selectedUrl: string | null = null;

    try {
      // Check if jobId exists in the request body
      const jobId = (body as any).jobId || `reservation_${Date.now()}`;

      // Fetch job details to get OTA provider
      const job = await this.jobService.getJobById(jobId);
      const otaProvider = job.ota_provider || 'Expedia'; // Default to Expedia
      selectedUrl = this.getUrlByOtaProvider(otaProvider);

      if (!selectedUrl) {
        return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
          success: false,
          message: `No scraper URL configured for OTA provider: ${otaProvider}`,
          error: 'Scraper URL not configured',
        });
      }

      // Add the selected URL to the request body
      const enhancedBody = {
        ...body,
        scraperUrl: selectedUrl,
      };

      // Update job current URL
      setTimeout(async () => {
        if (selectedUrl) {
          await this.jobItemService.updateJobCurrentUrl(jobId, selectedUrl);
        }
      }, 1000);

      // Get the correct API path based on OTA provider
      const apiPath = this.getApiPathByOtaProvider(
        otaProvider,
        'reservation-run-job',
      );

      const response = await firstValueFrom(
        this.httpService.post(`${selectedUrl}${apiPath}`, enhancedBody, {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 300000, // 5 minute timeout for long-running scraping jobs
        }),
      );

      return res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error.response?.data || {
        message: 'Job server is down',
      };
      return res.status(status).json(data);
    }
  }

  @Post('/api/rerun-failed-job')
  @ApiOperation({
    summary: 'Rerun failed or partial failed job (unified)',
    description:
      'Rerun a job that has failed or partially completed for any OTA provider (Expedia, Agoda, Booking). The system automatically determines the OTA provider from the job record and routes to the appropriate scraper server.',
  })
  @ApiBody({ type: RerunFailedJobRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Failed/partial job rerun completed successfully',
    type: RerunFailedJobResponseDto,
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
    status: 503,
    description: 'Scraper URL not configured for OTA provider',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Error processing job rerun',
    type: ErrorResponseDto,
  })
  async rerunFailedJob(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: RerunFailedJobRequestDto,
  ) {
    let selectedUrl: string | null = null;

    try {
      // Fetch job details to get OTA provider
      const job = await this.jobService.getJobById(body.jobId);
      const otaProvider = job.ota_provider || 'Expedia'; // Default to Expedia
      selectedUrl = this.getUrlByOtaProvider(otaProvider);

      if (!selectedUrl) {
        return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
          success: false,
          message: `No scraper URL configured for OTA provider: ${otaProvider}`,
          error: 'Scraper URL not configured',
        });
      }

      // Add the selected URL to the request body
      const enhancedBody = {
        ...body,
        scraperUrl: selectedUrl,
      };

      // Get the correct API path based on OTA provider
      const apiPath = this.getApiPathByOtaProvider(
        otaProvider,
        'rerun-failed-job',
      );

      const response = await firstValueFrom(
        this.httpService.post(`${selectedUrl}${apiPath}`, enhancedBody, {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 300000, // 5 minute timeout for long-running scraping jobs
        }),
      );

      return res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error.response?.data || {
        message: 'Job server is down',
      };
      return res.status(status).json(data);
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
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.getPrimaryScraperUrl()}/api/jobs/${jobId}/progress`,
          { headers: req.headers, params: req.query },
        ),
      );
      return res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error.response?.data || {
        message: 'Expedia Job server is down',
      };
      return res.status(status).json(data);
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

  @Post('/api/graphql-run-job')
  @ApiOperation({
    summary: 'Start unified GraphQL property scraping job',
    description:
      'Start a new GraphQL property scraping job for any OTA provider (Expedia, Agoda, Booking). The system automatically determines the OTA provider from the job record and routes to the appropriate scraper server.',
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
    status: 503,
    description: 'Scraper URL not configured for OTA provider',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Error processing property search',
    type: ErrorResponseDto,
  })
  async graphqlPropertyRunJob(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: PropertyRunJobRequestDto,
  ) {
    let selectedUrl: string | null = null;

    try {
      // Fetch job details to get OTA provider
      const job = await this.jobService.getJobById(body.jobId);
      const otaProvider = job.ota_provider || 'Expedia'; // Default to Expedia
      selectedUrl = this.getUrlByOtaProvider(otaProvider);

      if (!selectedUrl) {
        return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
          success: false,
          message: `No scraper URL configured for OTA provider: ${otaProvider}`,
          error: 'Scraper URL not configured',
        });
      }

      // Add the selected URL to the request body
      const enhancedBody = {
        ...body,
        scraperUrl: selectedUrl,
      };

      // Get the correct API path based on OTA provider
      const apiPath = this.getApiPathByOtaProvider(
        otaProvider,
        'graphql-run-job',
      );

      const response = await firstValueFrom(
        this.httpService.post(`${selectedUrl}${apiPath}`, enhancedBody, {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 300000, // 5 minute timeout for long-running scraping jobs
        }),
      );

      return res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error.response?.data || {
        message: 'Job server is down',
      };
      return res.status(status).json(data);
    }
  }
}
