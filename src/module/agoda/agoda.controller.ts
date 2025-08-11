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
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { IJobQueueUrlService } from '../job-queue-url/job-queue-url.interface';
import {
  AgodaErrorResponseDto,
  HealthResponseDto,
  PropertyRunJobRequestDto,
  PropertyRunJobResponseDto,
} from './agoda.dto';

@ApiTags('Agoda Scraper')
@Controller('/agoda')
export class AgodaController {
  private readonly scraperBaseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject('IJobQueueUrlService')
    private readonly jobQueueUrlService: IJobQueueUrlService,
  ) {
    const baseUrl = this.configService.get<string>('SCRAPER_BASE_URL');

    // Add http:// protocol if missing
    this.scraperBaseUrl =
      baseUrl &&
      (baseUrl.startsWith('http://') || baseUrl.startsWith('https://'))
        ? baseUrl
        : baseUrl
          ? `http://${baseUrl}`
          : 'http://localhost:3001'; // Default fallback
  }

  @Get('/')
  @ApiOperation({
    summary: 'Health check endpoint',
    description: 'Check if the Agoda scraper server is running and accessible',
  })
  @ApiResponse({
    status: 200,
    description: 'Server is running',
    type: HealthResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
    type: AgodaErrorResponseDto,
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
        message: 'Agoda Job server is down',
      };
      return res.status(status).json(data);
    }
  }

  @Post('/api/agoda/property-run-job')
  @ApiOperation({
    summary: 'Start Agoda property scraping job',
    description:
      'Start a new Agoda property scraping job for the specified property ID, date range, and job ID. Automatically assigns an available URL from the job queue.',
  })
  @ApiBody({ type: PropertyRunJobRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Agoda property scraping job completed successfully',
    type: PropertyRunJobResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Missing required parameters in request body',
    type: AgodaErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Scraping job already running',
    type: AgodaErrorResponseDto,
  })
  @ApiResponse({
    status: 503,
    description: 'All servers are busy - no available URLs',
    type: AgodaErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Error processing Agoda property search',
    type: AgodaErrorResponseDto,
  })
  async propertyRunJob(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: PropertyRunJobRequestDto,
  ) {
    let bookedUrl: any = null;

    try {
      // Book an available URL for this job
      // const urlBookingResult = await this.jobQueueUrlService.bookAvailableUrl(
      //   body.jobId,
      // );

      // if (!urlBookingResult.success) {
      //   return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      //     success: false,
      //     message: urlBookingResult.message,
      //     error: 'All servers are busy',
      //   });
      // }

      // bookedUrl = urlBookingResult.url;

      // Add the booked URL to the request body
      const enhancedBody = {
        ...body,
        scraperUrl: bookedUrl.url,
        urlId: bookedUrl.id,
      };

      // const response = await firstValueFrom(
      //   this.httpService.post(
      //     `${bookedUrl.url}/api/agoda/property-run-job`,
      //     enhancedBody,
      //     {
      //       headers: {
      //         'Content-Type': 'application/json',
      //         Accept: 'application/json',
      //       },
      //       timeout: 300000, // 5 minute timeout for long-running scraping jobs
      //     },
      //   ),
      // );

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.scraperBaseUrl}/api/agoda/property-run-job`,
          body,
          {
            headers: {
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
        message: 'Agoda Job server is down',
      };
      return res.status(status).json(data);
    }
  }
}
