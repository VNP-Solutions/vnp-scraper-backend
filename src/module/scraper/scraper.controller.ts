import { HttpService } from '@nestjs/axios';
import {
  Body,
  Controller,
  Get,
  HttpStatus,
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
import {
  ErrorResponseDto,
  HealthResponseDto,
  PauseResumeStopResponseDto,
  PropertyRunJobRequestDto,
  PropertyRunJobResponseDto,
  ReservationRunJobRequestDto,
  ReservationRunJobResponseDto,
  ScrapingStatusResponseDto,
} from './scraper.dto';

@ApiTags('Expedia Scraper')
@Controller('/expedia')
export class ScraperController {
  private readonly scraperBaseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.scraperBaseUrl =
      this.configService.get<string>('SCRAPER_BASE_URL') ||
      'http://localhost:3000';
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
        this.httpService.get(`${this.scraperBaseUrl}/`, {
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
        this.httpService.get(`${this.scraperBaseUrl}/auth`, {
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
        this.httpService.get(`${this.scraperBaseUrl}/oauth2callback`, {
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
        this.httpService.get(`${this.scraperBaseUrl}/api/scraping/status`, {
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
          `${this.scraperBaseUrl}/api/scraping/pause`,
          body,
          { headers: req.headers },
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
          `${this.scraperBaseUrl}/api/scraping/resume`,
          body,
          { headers: req.headers },
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
          `${this.scraperBaseUrl}/api/scraping/stop`,
          body,
          {
            headers: req.headers,
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
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.scraperBaseUrl}/api/expedia/property-run-job`,
          body,
          { headers: req.headers },
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
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.scraperBaseUrl}/api/expedia/reservation-run-job`,
          body,
          { headers: req.headers },
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
          `${this.scraperBaseUrl}/api/jobs/${jobId}/progress`,
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
    name: 'reasonForCharge',
    required: false,
    type: String,
    description:
      'Filter by reason for charge (partial match, case-insensitive)',
  })
  @ApiResponse({ status: 200, description: 'Job items retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({ status: 500, description: 'Server error' })
  async jobItems(
    @Req() req: Request,
    @Res() res: Response,
    @Param('jobId') jobId: string,
  ) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.scraperBaseUrl}/api/jobs/${jobId}/items`, {
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
}
