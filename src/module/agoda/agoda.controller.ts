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
import { IJobService } from '../job/job.interface';

import {
  AgodaErrorResponseDto,
  HealthResponseDto,
  PropertyRunJobRequestDto,
  PropertyRunJobResponseDto,
} from './agoda.dto';

@ApiTags('Agoda Scraper')
@Controller('/agoda')
export class AgodaController {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject('IJobService')
    private readonly jobService: IJobService,
  ) {
    // No need for base URL anymore - using OTA-specific URLs
  }

  /**
   * Get Agoda scraper URL for health check
   */
  private getAgodaScraperUrl(): string {
    const agodaUrl = this.configService.get<string>('AGODA_SERVER_URL');
    if (agodaUrl) {
      return agodaUrl.startsWith('http://') || agodaUrl.startsWith('https://')
        ? agodaUrl
        : `http://${agodaUrl}`;
    }

    // Fallback to localhost
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
        this.httpService.get(`${this.getAgodaScraperUrl()}/`, {
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
    summary: '[DEPRECATED] Start Agoda property scraping job',
    description:
      '[DEPRECATED] This endpoint is deprecated. Please use the unified endpoint at /scraper/api/property-run-job instead. Start a new Agoda property scraping job for the specified property ID, date range, and job ID.',
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
    description: 'Scraper URL not configured for OTA provider',
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
    let selectedUrl: string | null = null;

    try {
      // Fetch job details to get OTA provider
      const job = await this.jobService.getJobById(body.jobId);
      const otaProvider = job.ota_provider || 'Agoda'; // Default to Agoda
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

      const response = await firstValueFrom(
        this.httpService.post(
          `${selectedUrl}/api/agoda/property-run-job`,
          enhancedBody,
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
