import { HttpService } from '@nestjs/axios';
import {
  Body,
  Controller,
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
import { firstValueFrom } from 'rxjs';
import { IScraperJobItemService } from '../scraper-job-item.interface';
import { bookingRunJobSchema } from './booking.validation';
import {
  BookingRunJobRequestDto,
  BookingRunJobResponseDto,
  BookingStopJobRequestDto,
  BookingStopJobResponseDto,
} from './booking.dto';
import {
  ErrorResponseDto,
} from '../scraper.dto';

@ApiTags('Booking Scraper')
@Controller('/booking')
export class BookingController {
  private readonly scraperBaseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject('IScraperJobItemService')
    private readonly jobItemService: IScraperJobItemService,
  ) {
    const baseUrl =
      this.configService.get<string>('SCRAPER_BASE_URL');

    // Add http:// protocol if missing
    this.scraperBaseUrl =
      baseUrl.startsWith('http://') || baseUrl.startsWith('https://')
        ? baseUrl
        : `http://${baseUrl}`;
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
      // Validate request payload
      const validationResult = bookingRunJobSchema.safeParse(body);
      if (!validationResult.success) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          status: HttpStatus.BAD_REQUEST,
          message: 'Validation failed',
          errors: validationResult.error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
      }

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.scraperBaseUrl}/api/booking/run-job`,
          validationResult.data,
          {
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            timeout: 300000, // 5 minute timeout for job initialization
          },
        ),
      );
      return res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error.response?.data || {
        message: 'Booking scraper server is down',
      };
      return res.status(status).json(data);
    }
  }

  @Post('/api/booking/stop-job')
  @ApiOperation({
    summary: 'Stop booking scraping job',
    description: 'Stop a running booking scraping job and mark job items as cancelled',
  })
  @ApiBody({ type: BookingStopJobRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Booking scraping job stopped successfully',
    type: BookingStopJobResponseDto,
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
    @Body() body: BookingStopJobRequestDto,
  ) {
    try {
      const { jobId } = body;

      if (!jobId) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          status: HttpStatus.BAD_REQUEST,
          message: 'Job ID is required',
        });
      }

      // Forward the stop request to the modular scraper backend
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.scraperBaseUrl}/api/booking/stop-job`,
          { jobId },
          {
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            timeout: 30000, // 30 second timeout
          },
        ),
      );
      
      return res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error.response?.data || {
        message: 'Failed to stop booking scraping job',
      };
      return res.status(status).json(data);
    }
  }
}