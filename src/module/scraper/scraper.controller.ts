import { HttpService } from '@nestjs/axios';
import {
    Body,
    Controller,
    Delete,
    Get,
    HttpStatus,
    Inject,
    Logger,
    Param,
    Post,
    Query,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    ApiBearerAuth,
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

import { ValidateBody } from '../../common/decorators/validate.decorator';
import { ResponseHandler } from '../../common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IJobService } from '../job/job.interface';
import { IPropertyCredentialsService } from '../property-credentials/property-credentials.interface';
import { IRetrievalService } from '../retrieval/retrieval.interface';
import { BookingBulkDispatchService } from './booking-bulk-dispatch.service';
import {
  buildDbmsLookupUrl,
  buildPropertyCredentialsPayloadFromDbmsStep,
  extractOtaCredentialsFromDbmsLookup,
  hasOtaIdForDbmsLookup,
  isDbmsOtaProvider,
} from './dbms-lookup.util';
import { IScheduledJobService } from './scheduled-job.interface';
import {
    createScheduledJobSchema,
    removeJobIdsFromAllScheduledJobsSchema,
    removeJobsFromScheduledJobSchema,
} from './scheduled-job.validation';
import { IScraperJobItemService } from './scraper-job-item.interface';
import { pushJobsToQueue } from '../../helpers/sqsHelper';
import { triggerLambda } from '../../helpers/lambdaHelper';
import {
    AllJobItemsResponseDto,
    BatchPropertyRunJobRequestDto,
    BatchPropertyRunJobResponseDto,
    BatchRetrievalRunJobRequestDto,
    BatchRetrievalRunJobResponseDto,
    CreateScheduledJobDto,
    CreateScheduledJobResponseDto,
    ErrorResponseDto,
    HealthResponseDto,
    PauseResumeStopResponseDto,
    PropertyRunJobRequestDto,
    PropertyRunJobResponseDto,
    RemoveJobIdsFromAllScheduledJobsDto,
    RemoveJobIdsFromAllScheduledJobsResponseDto,
    RemoveJobsFromScheduledJobDto,
    RemoveJobsFromScheduledJobResponseDto,
    RerunFailedJobRequestDto,
    RerunFailedJobResponseDto,
    ReservationRunJobRequestDto,
    ReservationRunJobResponseDto,
    ResumeScrapingRequestDto,
    RetrievalRunJobRequestDto,
    ScheduledJobResponseDto,
    ScrapingStatusResponseDto,
    StopScrapingRequestDto,
} from './scraper.dto';

@ApiTags('Unified Scraper')
@ApiBearerAuth('JWT-auth')
@Controller('/scraper')
export class ScraperController {
  private readonly logger = new Logger(ScraperController.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject('IScraperJobItemService')
    private readonly jobItemService: IScraperJobItemService,
    @Inject('IJobService')
    private readonly jobService: IJobService,
    @Inject('IRetrievalService')
    private readonly retrievalService: IRetrievalService,
    @Inject('IPropertyCredentialsService')
    private readonly propertyCredentialsService: IPropertyCredentialsService,
    @Inject('IScheduledJobService')
    private readonly scheduledJobService: IScheduledJobService,
    private readonly bookingBulkDispatchService: BookingBulkDispatchService,
  ) {
    // No need for base URL anymore - using OTA-specific URLs
  }

  /**
   * Get primary scraper URL (defaults to Expedia server for general endpoints)
   */
  private getPrimaryScraperUrl(): string {
    const expediadUrl = this.configService.get<string>('EXPEDIA_SERVER_URL');
    if (expediadUrl) {
      const url = this.normalizeUrl(expediadUrl);
      console.log(`Using Expedia URL: ${url}`);
      return url;
    }

    // Fallback to other OTA URLs if Expedia is not configured
    const agodaUrl = this.configService.get<string>('AGODA_SERVER_URL');
    if (agodaUrl) {
      const url = this.normalizeUrl(agodaUrl);
      console.log(`Using Agoda URL: ${url}`);
      return url;
    }

    const bookingUrl = this.configService.get<string>('BOOKING_SERVER_URL');
    if (bookingUrl) {
      const url = this.normalizeUrl(bookingUrl);
      console.log(`Using Booking URL: ${url}`);
      return url;
    }

    // Final fallback
    console.log('Using fallback URL: http://localhost:3001');
    return 'http://localhost:3001';
  }

  /**
   * Normalize URL by adding protocol if missing
   * Prefers HTTPS in production, HTTP in development
   */
  private normalizeUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    // Check if we're in production to prefer HTTPS
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    const defaultProtocol = isProduction ? 'https' : 'http';

    return `${defaultProtocol}://${url}`;
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
        console.log(`Unknown OTA provider: ${otaProvider}`);
        return null;
    }

    const url = this.configService.get<string>(envKey);
    if (!url) {
      console.log(`No URL configured for ${otaProvider} (${envKey})`);
      return null;
    }

    const normalizedUrl = this.normalizeUrl(url);
    console.log(`${otaProvider} URL: ${normalizedUrl}`);
    return normalizedUrl;
  }

  /**
   * Get Expedia retrieval server URL
   */
  private getExpediaRetrievalUrl(): string | null {
    const url = this.configService.get<string>('EXPEDIA_RETRIVAL_SERVER_URL');
    if (!url) {
      console.log('No EXPEDIA_RETRIVAL_SERVER_URL configured');
      return null;
    }

    const normalizedUrl = this.normalizeUrl(url);
    console.log(`Expedia Retrieval URL: ${normalizedUrl}`);
    return normalizedUrl;
  }

  /**
   * Get Agoda retrieval server URL (uses AGODA_SERVER_URL for retrieval)
   */
  private getAgodaRetrievalUrl(): string | null {
    const url = this.configService.get<string>('AGODA_RETRIVAL_SERVER_URL');
    if (!url) {
      console.log('No AGODA_SERVER_URL configured');
      return null;
    }

    const normalizedUrl = this.normalizeUrl(url);
    console.log(`Agoda Retrieval URL: ${normalizedUrl}`);
    return normalizedUrl;
  }

  /**
   * Get retrieval server URL based on OTA provider
   */
  private getRetrievalUrlByOtaProvider(otaProvider: string): string | null {
    switch (otaProvider) {
      case 'Expedia':
        return this.getExpediaRetrievalUrl();
      case 'Agoda':
        return this.getAgodaRetrievalUrl();
      default:
        console.log(
          `Unknown OTA provider: ${otaProvider}, defaulting to Expedia`,
        );
        return this.getExpediaRetrievalUrl();
    }
  }

  /**
   * Get Expedia DB server URL
   */
  private getExpediaDbUrl(): string | null {
    const url = this.configService.get<string>('EXPEDIA_DB_SERVER_URL');
    if (!url) {
      console.log('No EXPEDIA_DB_SERVER_URL configured');
      return null;
    }

    const normalizedUrl = this.normalizeUrl(url);
    console.log(`Expedia DB URL: ${normalizedUrl}`);
    return normalizedUrl;
  }

  /**
   * Validate that startDate and endDate are not in the future (for DB flow).
   * Returns true if valid; otherwise sends 400 response and returns false.
   */
  private validateDbDatesNotFuture(
    body: { startDate: string; endDate: string },
    res: Response,
  ): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const parseMmDdYyyy = (dateStr: string): Date | null => {
      const parts = dateStr.trim().split('/');
      if (parts.length !== 3) return null;
      const month = parseInt(parts[0], 10);
      const day = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
      const d = new Date(year, month - 1, day);
      return isNaN(d.getTime()) ? null : d;
    };
    const start = parseMmDdYyyy(body.startDate);
    const end = parseMmDdYyyy(body.endDate);
    if (!start || !end) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message:
          'Invalid date format. Use MM/DD/YYYY for startDate and endDate.',
        error: 'Invalid date format',
      });
      return false;
    }
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    if (start > today) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'startDate must not be a future date.',
        error: 'startDate is in the future',
      });
      return false;
    }
    if (end > today) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'endDate must not be a future date.',
        error: 'endDate is in the future',
      });
      return false;
    }
    return true;
  }

  private toScraperPropertyRunJobBody(body: PropertyRunJobRequestDto) {
    return {
      jobId: body.jobId,
      startDate: body.startDate,
      endDate: body.endDate,
    };
  }

  private async maybeSyncPropertyCredentialsFromDbms(
    body: PropertyRunJobRequestDto,
  ): Promise<void> {
    // body.ota_provider / body.ota_id are optional fields in the DTO — many
    // callers (e.g. POST /scraper/api/property-run-job from the frontend)
    // only send { jobId, startDate, endDate } and rely on the controller
    // to derive the OTA provider from the job record later. So we must
    // bail out gracefully here if either field is missing. The previous
    // code did `body?.ota_provider.toLowerCase()` — the `?.` was only on
    // body, so an undefined ota_provider threw
    //   TypeError: Cannot read properties of undefined (reading 'toLowerCase')
    // before the handler could even start.
    const provider = body?.ota_provider?.toLowerCase();
    if (
      !provider ||
      !isDbmsOtaProvider(provider as 'expedia' | 'agoda' | 'booking')
    ) {
      return;
    }
    if (!hasOtaIdForDbmsLookup(body?.ota_id)) {
      return;
    }
    const baseUrl = this.configService.get<string>('DBMS_LOOKUP_BASE_URL')?.trim?.();
    const token = this.configService.get<string>('DBMS_JWT_TOKEN')?.trim?.();

    if (!baseUrl || !token) {
      this.logger.warn(
        'DBMS credential sync skipped: DBMS_LOOKUP_BASE_URL or DBMS_JWT_TOKEN is not set',
      );
      return;
    }

    const url = buildDbmsLookupUrl(
      baseUrl,
      body.ota_provider,
      body.ota_id as string | number,
    );

    let raw: unknown;

    try {
      const response = await firstValueFrom(
        this.httpService.get<unknown>(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }),
      );
      const status = response?.status ?? 0;
      // DBMS wraps the list in { data: [...] }; Axios already exposes the HTTP body as response.data.
      raw = (response?.data as { data?: unknown } | undefined)?.data;
      if (status < 200 || status >= 300) {
        this.logger.warn(
          `DBMS lookup returned non-success HTTP status ${status}`,
        );
        return;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`DBMS lookup request failed: ${msg}`);
      return;
    }

    const step3 = extractOtaCredentialsFromDbmsLookup(raw, body.ota_provider);
    if (!step3) {
      return;
    }

    const credentialsId = body?.credentials_id?.trim?.();
    const propertyId = body?.property_id?.trim?.();
    if (!credentialsId || !propertyId) {
      this.logger.warn(
        'DBMS credentials extracted but credentials_id or property_id is missing; skipping property-credentials update',
      );
      return;
    }

    try {
      const payload = buildPropertyCredentialsPayloadFromDbmsStep(
        propertyId,
        step3,
      );
      await this.propertyCredentialsService.updatePropertyCredentials(
        credentialsId,
        payload,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `property-credentials update after DBMS lookup failed: ${msg}`,
      );
    }
  }

  /**
   * Get API path based on OTA provider and job type
   */
  private getApiPathByOtaProvider(
    otaProvider: string,
    jobType: string = 'property-run-job',
  ): string {
    const baseApiPath = this.getBaseApiPath(otaProvider);

    // Special handling for Expedia based on EXPEDIA_MODE (only Expedia supports GraphQL mode)
    if (otaProvider === 'Expedia' && jobType === 'property-run-job') {
      const expediadMode = this.configService.get<string>('EXPEDIA_MODE');
      if (expediadMode === 'graphql') {
        return `${baseApiPath}/graphql-run-job`;
      }
      // Default to scraper mode for Expedia
      return `${baseApiPath}/property-run-job`;
    }

    // For all other providers (Booking, Agoda) and job types, use standard path
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

  /**
   * Determine scraping mode based on OTA provider. Only Expedia supports mode switching via EXPEDIA_MODE.
   */
  private getScrapingMode(otaProvider: string = 'Expedia'): string {
    switch (otaProvider) {
      case 'Expedia':
        const expediadMode = this.configService.get<string>('EXPEDIA_MODE');
        if (expediadMode === 'graphql') {
          return 'graphql';
        }
        // Default to 'expedia' if EXPEDIA_MODE is 'scraper' or undefined
        return 'expedia';

      case 'Booking':
        // Booking only has property-run-job endpoint
        return 'booking';

      case 'Agoda':
        // Agoda only has property-run-job endpoint
        return 'agoda';

      default:
        // Fallback to expedia mode for unknown providers
        return 'expedia';
    }
  }

  @Get('/debug-urls')
  @ApiOperation({
    summary: 'Debug URL and mode configuration',
    description:
      'Show all configured URLs, Expedia mode configuration, and their status for debugging HTTPS issues and mode configurations',
  })
  @ApiResponse({
    status: 200,
    description: 'URL configuration retrieved',
  })
  async debugUrls(@Res() res: Response) {
    const urls = {
      EXPEDIA_SERVER_URL: this.configService.get<string>('EXPEDIA_SERVER_URL'),
      EXPEDIA_RETRIVAL_SERVER_URL: this.configService.get<string>(
        'EXPEDIA_RETRIVAL_SERVER_URL',
      ),
      EXPEDIA_DB_SERVER_URL: this.configService.get<string>(
        'EXPEDIA_DB_SERVER_URL',
      ),
      AGODA_SERVER_URL: this.configService.get<string>('AGODA_SERVER_URL'),
      BOOKING_SERVER_URL: this.configService.get<string>('BOOKING_SERVER_URL'),
      NODE_ENV: this.configService.get<string>('NODE_ENV'),
      EXPEDIA_MODE: this.configService.get<string>('EXPEDIA_MODE'),
    };

    const normalizedUrls = {
      expedia: urls.EXPEDIA_SERVER_URL
        ? this.normalizeUrl(urls.EXPEDIA_SERVER_URL)
        : null,
      expediadRetrieval: urls.EXPEDIA_RETRIVAL_SERVER_URL
        ? this.normalizeUrl(urls.EXPEDIA_RETRIVAL_SERVER_URL)
        : null,
      expediadDb: urls.EXPEDIA_DB_SERVER_URL
        ? this.normalizeUrl(urls.EXPEDIA_DB_SERVER_URL)
        : null,
      agoda: urls.AGODA_SERVER_URL
        ? this.normalizeUrl(urls.AGODA_SERVER_URL)
        : null,
      booking: urls.BOOKING_SERVER_URL
        ? this.normalizeUrl(urls.BOOKING_SERVER_URL)
        : null,
      primary: this.getPrimaryScraperUrl(),
    };

    return res.status(HttpStatus.OK).json({
      success: true,
      message: 'URL and Expedia mode configuration debug info',
      data: {
        rawUrls: urls,
        normalizedUrls,
        httpsAgentConfig: {
          rejectUnauthorized:
            this.configService.get('NODE_ENV') === 'production',
          timeout: 300000,
        },
      },
    });
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
    const targetUrl = `${this.getPrimaryScraperUrl()}/`;
    console.log(`Health check - attempting connection to: ${targetUrl}`);

    try {
      const response = await firstValueFrom(
        this.httpService.get(targetUrl, {
          headers: req.headers,
          params: req.query,
        }),
      );
      console.log(`Health check successful - status: ${response.status}`);
      return res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error(`Health check failed for ${targetUrl}:`, {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        isHttpsError:
          error.code === 'CERT_HAS_EXPIRED' ||
          error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
          error.code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
          error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT',
      });

      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error.response?.data || {
        message: 'Job server is down',
        error: error.message,
        code: error.code,
        url: targetUrl,
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
      'Resume a previously paused scraping job from where it left off. Requires startDate, endDate, and jobId. The OTA provider is automatically determined from the job record, and scraping mode is set based on EXPEDIA_MODE environment variable (Booking and Agoda use fixed endpoints).',
  })
  @ApiBody({ type: ResumeScrapingRequestDto })
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
      // Fetch job details to get OTA provider
      const job = await this.jobService.getJobById(body.jobId);
      const otaProvider = job.ota_provider || 'Expedia'; // Default to Expedia

      // Determine scraping_mode based on OTA provider and environment variable
      const scrapingMode = this.getScrapingMode(otaProvider);

      // Create complete request body with all required fields
      const completeRequestBody = {
        startDate: body.startDate,
        endDate: body.endDate,
        jobId: body.jobId,
        ota_provider: otaProvider, // Get from job record
        scraping_mode: scrapingMode, // Get from environment variable
      };

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.getPrimaryScraperUrl()}/api/scraping/resume`,
          completeRequestBody,
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

  @Post('/api/scraping/stop')
  @ApiOperation({
    summary: 'Stop current scraping job',
    description:
      'Completely stop the current scraping job. Requires jobId in request body.',
  })
  @ApiBody({ type: StopScrapingRequestDto })
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
      // Fetch job details to get OTA provider
      const job = await this.jobService.getJobById(body.jobId);
      const otaProvider = job.ota_provider || 'Expedia'; // Default to Expedia

      // Get URL based on OTA provider
      const selectedUrl = this.getUrlByOtaProvider(otaProvider);

      if (!selectedUrl) {
        return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
          success: false,
          message: `No scraper URL configured for OTA provider: ${otaProvider}`,
          error: 'Scraper URL not configured',
        });
      }

      const response = await firstValueFrom(
        this.httpService.post(`${selectedUrl}/api/scraping/stop`, body, {
          headers: {
            // ...req.headers,
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

  @Post('/api/retrieval/pause')
  @ApiOperation({
    summary: 'Pause current retrieval job',
    description: 'Gracefully pause the currently running retrieval job.',
  })
  @ApiResponse({
    status: 200,
    description: 'Retrieval paused successfully',
    type: PauseResumeStopResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot pause retrieval - no active job running',
    type: PauseResumeStopResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Error pausing retrieval',
    type: ErrorResponseDto,
  })
  async retrievalPause(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: any,
  ) {
    try {
      const retrievalUrl = this.getExpediaRetrievalUrl();
      if (!retrievalUrl) {
        return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
          success: false,
          message:
            'No Expedia retrieval server URL configured (EXPEDIA_RETRIVAL_SERVER_URL)',
          error: 'Expedia retrieval server URL not configured',
        });
      }

      const response = await firstValueFrom(
        this.httpService.post(`${retrievalUrl}/api/retrieval/pause`, body, {
          headers: {
            // ...req.headers,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 300000, // 5 minute timeout for long-running retrieval jobs
        }),
      );
      return res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error.response?.data || {
        message: 'Expedia Retrieval server is down',
      };
      return res.status(status).json(data);
    }
  }

  @Post('/api/retrieval/resume')
  @ApiOperation({
    summary: 'Resume paused retrieval job',
    description:
      'Resume a previously paused retrieval job from where it left off. Requires startDate, endDate, and jobId. The OTA provider is automatically determined from the job record, and scraping mode is set based on EXPEDIA_MODE environment variable.',
  })
  @ApiBody({ type: ResumeScrapingRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Retrieval resumed successfully',
    type: PauseResumeStopResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot resume retrieval - no paused job found',
    type: PauseResumeStopResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Error resuming retrieval',
    type: ErrorResponseDto,
  })
  async retrievalResume(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: any,
  ) {
    try {
      const retrievalUrl = this.getExpediaRetrievalUrl();
      if (!retrievalUrl) {
        return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
          success: false,
          message:
            'No Expedia retrieval server URL configured (EXPEDIA_RETRIVAL_SERVER_URL)',
          error: 'Expedia retrieval server URL not configured',
        });
      }

      // Fetch job details to get OTA provider
      const job = await this.jobService.getJobById(body.jobId);
      const otaProvider = job.ota_provider || 'Expedia'; // Default to Expedia

      // Determine scraping_mode based on OTA provider and environment variable
      const scrapingMode = this.getScrapingMode(otaProvider);

      // Create complete request body with all required fields
      const completeRequestBody = {
        startDate: body.startDate,
        endDate: body.endDate,
        jobId: body.jobId,
        ota_provider: otaProvider, // Get from job record
        scraping_mode: scrapingMode, // Get from environment variable
      };

      const response = await firstValueFrom(
        this.httpService.post(
          `${retrievalUrl}/api/retrieval/resume`,
          completeRequestBody,
          {
            headers: {
              // ...req.headers,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            timeout: 300000, // 5 minute timeout for long-running retrieval jobs
          },
        ),
      );
      return res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error.response?.data || {
        message: 'Expedia Retrieval server is down',
      };
      return res.status(status).json(data);
    }
  }

  @Post('/api/retrieval/stop')
  @ApiOperation({
    summary: 'Stop current retrieval job',
    description:
      'Completely stop the current retrieval job based on OTA provider (Expedia or Agoda). Requires jobId or retrieval_id in request body. The OTA provider is automatically determined from the retrieval/job record.',
  })
  @ApiBody({ type: StopScrapingRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Retrieval stopped successfully',
    type: PauseResumeStopResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid request - retrieval/job not found or OTA provider not supported',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 503,
    description: 'Retrieval server URL not configured for the OTA provider',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Error stopping retrieval',
    type: ErrorResponseDto,
  })
  async retrievalStop(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: any,
  ) {
    try {
      // Get retrieval_id or jobId from body
      const retrievalId = body.retrieval_id || body.jobId;
      if (!retrievalId) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: 'retrieval_id or jobId is required',
          error: 'Missing retrieval_id or jobId in request body',
        });
      }

      // Fetch retrieval details to get OTA provider
      let otaProvider = 'Expedia'; // Default fallback
      try {
        const retrieval =
          await this.retrievalService.getRetrievalById(retrievalId);
        otaProvider = retrieval.ota_provider || 'Expedia';
      } catch (error) {
        // If retrieval not found, try to get from job
        try {
          const job = await this.jobService.getJobById(retrievalId);
          otaProvider = job.ota_provider || 'Expedia';
        } catch (jobError) {
          return res.status(HttpStatus.BAD_REQUEST).json({
            success: false,
            message: `Retrieval or Job with ID ${retrievalId} not found`,
            error: 'Invalid retrieval_id or jobId',
          });
        }
      }

      // Get retrieval URL based on OTA provider
      const retrievalUrl = this.getRetrievalUrlByOtaProvider(otaProvider);
      if (!retrievalUrl) {
        const configKey =
          otaProvider === 'Expedia'
            ? 'EXPEDIA_RETRIVAL_SERVER_URL'
            : otaProvider === 'Agoda'
              ? 'AGODA_SERVER_URL'
              : 'RETRIEVAL_SERVER_URL';
        return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
          success: false,
          message: `No ${otaProvider} retrieval server URL configured (${configKey})`,
          error: `${otaProvider} retrieval server URL not configured`,
        });
      }

      // Create request body with OTA provider info
      const requestBody = {
        ...body,
        retrieval_id: retrievalId,
        jobId: body.jobId || retrievalId,
        ota_provider: otaProvider,
      };

      const response = await firstValueFrom(
        this.httpService.post(
          `${retrievalUrl}/api/retrieval/stop`,
          requestBody,
          {
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            timeout: 300000, // 5 minute timeout for long-running retrieval jobs
          },
        ),
      );
      return res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        'Retrieval server error';
      const data = error.response?.data || {
        message: errorMessage,
        error: 'Failed to stop retrieval job',
      };
      return res.status(status).json(data);
    }
  }

  @Post('/api/db/stop')
  @ApiOperation({
    summary: 'Stop current DB run job',
    description:
      'Completely stop the current DB run job. Requires jobId in request body.',
  })
  @ApiBody({ type: StopScrapingRequestDto })
  @ApiResponse({
    status: 200,
    description: 'DB run job stopped successfully',
    type: PauseResumeStopResponseDto,
  })
  @ApiResponse({
    status: 503,
    description: 'Expedia DB server URL not configured',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Error stopping DB run job',
    type: ErrorResponseDto,
  })
  async dbRunStop(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: any,
  ) {
    try {
      const dbUrl = this.getExpediaDbUrl();
      if (!dbUrl) {
        return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
          success: false,
          message:
            'No Expedia DB server URL configured (EXPEDIA_DB_SERVER_URL)',
          error: 'Expedia DB server URL not configured',
        });
      }

      const response = await firstValueFrom(
        this.httpService.post(`${dbUrl}/api/db/stop`, body, {
          headers: {
            // ...req.headers,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 300000, // 5 minute timeout for long-running DB run jobs
        }),
      );
      return res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error.response?.data || {
        message: 'Expedia DB server is down',
      };
      return res.status(status).json(data);
    }
  }

  @Post('/api/property-run-job')
  @ApiOperation({
    summary: 'Start unified property scraping job',
    description:
      'Start a new property scraping job for any OTA provider (Expedia, Agoda, Booking). The system automatically determines the OTA provider from the job record and routes to the appropriate scraper server. For Expedia, EXPEDIA_MODE determines whether to use GraphQL (graphql-run-job) or regular scraper (property-run-job) endpoint. Booking and Agoda only use property-run-job.',
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
    const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tag = `[propertyRunJob ${reqId}]`;
    console.log(`${tag} >>> ENTER`);
    console.log(`${tag} method: ${req.method}, url: ${req.originalUrl}`);
    console.log(`${tag} body received:`, JSON.stringify(body));
    console.log(`${tag} body.jobId:`, body?.jobId);

    let selectedUrl: string | null = null;

    try {
      console.log(`${tag} step 1: maybeSyncPropertyCredentialsFromDbms(body)`);
      await this.maybeSyncPropertyCredentialsFromDbms(body);
      console.log(`${tag} step 1: OK`);

      console.log(`${tag} step 2: jobService.getJobById(${body?.jobId})`);
      const job = await this.jobService.getJobById(body.jobId);
      console.log(
        `${tag} step 2: OK - job exists?`,
        Boolean(job),
        '- ota_provider:',
        job?.ota_provider,
        '- billing_type:',
        job?.billing_type,
        '- job_status:',
        job?.job_status,
      );

      const otaProvider = job.ota_provider || 'Expedia';
      const billingType = job.billing_type;
      console.log(
        `${tag} resolved otaProvider=${otaProvider}, billingType=${billingType}`,
      );

      // For Expedia jobs: push to AWS SQS queue instead of HTTP call
      if (otaProvider === 'Expedia' && billingType !== 'DB') {
        console.log(`${tag} branch: Expedia + non-DB → SQS path`);

        console.log(`${tag} step 3a: pushJobsToQueue([job])`);
        await pushJobsToQueue([job]);
        console.log(`${tag} step 3a: OK`);

        console.log(`${tag} step 3b: updateJob → InQueue`);
        await this.jobService.updateJob(body.jobId, {
          job_status: 'InQueue',
        });
        console.log(`${tag} step 3b: OK`);

        console.log(`${tag} step 3c: waiting 3s for SQS visibility`);
        await new Promise((resolve) => setTimeout(resolve, 3000));

        console.log(`${tag} step 3d: triggerLambda('expedia')`);
        await triggerLambda('expedia');
        console.log(`${tag} step 3d: OK`);

        console.log(`${tag} <<< 200 InQueue (SQS path)`);
        return res.status(HttpStatus.OK).json({
          success: true,
          message: 'Job successfully queued for processing',
          data: {
            jobId: body.jobId,
            status: 'InQueue',
            otaProvider: 'Expedia',
          },
        });
      }

      // Check if billing_type is 'DB' and route to DB server
      if (billingType === 'DB') {
        console.log(`${tag} branch: billing_type=DB → Expedia DB server path`);
        selectedUrl = this.getExpediaDbUrl();
        console.log(`${tag} step 4a: getExpediaDbUrl() = ${selectedUrl}`);

        if (!selectedUrl) {
          console.log(`${tag} <<< 503 Expedia DB server URL not configured`);
          return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
            success: false,
            message:
              'No Expedia DB server URL configured (EXPEDIA_DB_SERVER_URL)',
            error: 'Expedia DB server URL not configured',
          });
        }

        console.log(`${tag} step 4b: validateDbDatesNotFuture`);
        if (!this.validateDbDatesNotFuture(body, res)) {
          console.log(
            `${tag} <<< response written by validateDbDatesNotFuture (early return)`,
          );
          return;
        }
        console.log(`${tag} step 4b: OK`);

        const enhancedBody = {
          ...this.toScraperPropertyRunJobBody(body),
          scraperUrl: selectedUrl,
        };

        console.log(
          `${tag} step 4c: POST ${selectedUrl}/api/expedia/db-run-job`,
        );
        const response = await firstValueFrom(
          this.httpService.post(
            `${selectedUrl}/api/expedia/db-run-job`,
            enhancedBody,
            {
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
              },
              timeout: 300000,
            },
          ),
        );
        console.log(
          `${tag} step 4c: OK - upstream status=${response.status}`,
        );

        console.log(`${tag} <<< ${response.status} (Expedia DB path)`);
        return res.status(response.status).json(response.data);
      }

      // Regular flow for non-DB billing types
      console.log(
        `${tag} branch: non-Expedia or non-DB → regular HTTP flow (otaProvider=${otaProvider})`,
      );
      selectedUrl = this.getUrlByOtaProvider(otaProvider);
      console.log(
        `${tag} step 5a: getUrlByOtaProvider(${otaProvider}) = ${selectedUrl}`,
      );

      if (!selectedUrl) {
        console.log(
          `${tag} <<< 503 No scraper URL configured for ${otaProvider}`,
        );
        return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
          success: false,
          message: `No scraper URL configured for OTA provider: ${otaProvider}`,
          error: 'Scraper URL not configured',
        });
      }

      const enhancedBody = {
        ...this.toScraperPropertyRunJobBody(body),
        scraperUrl: selectedUrl,
      };

      setTimeout(async () => {
        if (selectedUrl) {
          try {
            await this.jobItemService.updateJobCurrentUrl(
              body.jobId,
              selectedUrl,
            );
            console.log(
              `${tag} (deferred) updateJobCurrentUrl OK for jobId=${body.jobId}, url=${selectedUrl}`,
            );
          } catch (e: any) {
            console.error(
              `${tag} (deferred) updateJobCurrentUrl FAILED:`,
              e?.message,
              e?.stack,
            );
          }
        }
      }, 1000);

      const apiPath = this.getApiPathByOtaProvider(
        otaProvider,
        'property-run-job',
      );

      if (otaProvider === 'Expedia') {
        const expediadMode =
          this.configService.get<string>('EXPEDIA_MODE') || 'scraper';
        console.log(`${tag} Using Expedia ${expediadMode} mode: ${apiPath}`);
      } else {
        console.log(`${tag} Using ${otaProvider} endpoint: ${apiPath}`);
      }

      console.log(`${tag} step 5b: POST ${selectedUrl}${apiPath}`);
      const response = await firstValueFrom(
        this.httpService.post(`${selectedUrl}${apiPath}`, enhancedBody, {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 300000,
        }),
      );
      console.log(
        `${tag} step 5b: OK - upstream status=${response.status}`,
      );

      console.log(`${tag} <<< ${response.status} (regular path)`);
      return res.status(response.status).json(response.data);
    } catch (error: any) {
      // IMPORTANT: log the FULL error before we collapse it into a generic
      // "Job server is down" response. Without this, the upstream
      // exception is silently swallowed and you only see a 500 in the
      // access log with no clue what went wrong.
      console.error(`${tag} !!! CAUGHT EXCEPTION`);
      console.error(`${tag} error.name:`, error?.name);
      console.error(`${tag} error.message:`, error?.message);
      console.error(`${tag} error.code:`, error?.code);
      console.error(`${tag} error.response?.status:`, error?.response?.status);
      console.error(
        `${tag} error.response?.data:`,
        typeof error?.response?.data === 'string'
          ? error.response.data.slice(0, 1000)
          : JSON.stringify(error?.response?.data),
      );
      console.error(
        `${tag} error.config?.url:`,
        error?.config?.url,
      );
      console.error(`${tag} error.stack:`, error?.stack);

      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error.response?.data || {
        message: 'Job server is down',
      };
      console.log(`${tag} <<< ${status} (error path)`);
      return res.status(status).json(data);
    }
  }

  @Post('/api/batch-property-run-job')
  @ApiOperation({
    summary: 'Start batch property scraping jobs',
    description:
      'Execute multiple property scraping jobs in batch. Each job is automatically routed to the appropriate scraper based on its OTA provider (Expedia, Agoda, Booking). Jobs are processed sequentially to ensure stability. For Expedia, EXPEDIA_MODE determines whether to use GraphQL or regular scraper endpoint.',
  })
  @ApiBody({ type: BatchPropertyRunJobRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Batch property scraping jobs completed',
    type: BatchPropertyRunJobResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request body or missing job data',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Error processing batch jobs',
    type: ErrorResponseDto,
  })
  async batchPropertyRunJob(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: BatchPropertyRunJobRequestDto,
  ) {
    return this.runBatchPropertyRunJobResponse(res, body, {
      bookingGroupByCredentials: false,
    });
  }

  @Post('/api/batch-property-run-job-by-booking-credentials')
  @ApiOperation({
    summary: 'Start batch property jobs (Booking grouped by credentials)',
    description:
      'Same request shape as batch-property-run-job, plus optional scheduled_job_id (ScheduledJob Mongo id). Expedia, Agoda, and Expedia DB unchanged. Booking: grouped POST includes scheduled_job_id at top and on each credential_groups item, with job_ids, phone_number, slot, booking_username, booking_password. Path: BOOKING_GROUPED_BULK_API_PATH.',
  })
  @ApiBody({ type: BatchPropertyRunJobRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Batch property scraping jobs completed',
    type: BatchPropertyRunJobResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request body or missing job data',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Error processing batch jobs',
    type: ErrorResponseDto,
  })
  async batchPropertyRunJobByBookingCredentials(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: BatchPropertyRunJobRequestDto,
  ) {
    return this.runBatchPropertyRunJobResponse(res, body, {
      bookingGroupByCredentials: true,
    });
  }

  private async runBatchPropertyRunJobResponse(
    res: Response,
    body: BatchPropertyRunJobRequestDto,
    options: { bookingGroupByCredentials: boolean },
  ) {
    try {
      if (!body.jobs || body.jobs.length === 0) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: 'No jobs provided in request',
          error: 'Jobs array is required and cannot be empty',
        });
      }

      const processedResults = [];

      // Group jobs by OTA provider and billing type
      const expediaDbJobs = [];
      const expediaJobs = [];
      const agodaJobs = [];
      const bookingJobs: Array<{
        jobId: string;
        otaProvider: string;
        propertyId?: string | null;
      }> = [];
      
      // Collect Expedia jobs for SQS push
      const expediaJobsForSqs = [];

      // Fetch job details and group them
      for (const jobRequest of body.jobs) {
        try {
          // Fetch job details to get OTA provider and billing_type
          const job = await this.jobService.getJobById(jobRequest.jobId);
          const otaProvider = job.ota_provider || 'Expedia';
          const billingType = job.billing_type;

          // Add Expedia jobs to the collection for SQS push
          if (otaProvider === 'Expedia') {
            expediaJobsForSqs.push(job);
          }

          if (billingType === 'DB' && otaProvider === 'Expedia') {
            expediaDbJobs.push({ ...jobRequest, otaProvider, billingType });
          } else if (otaProvider === 'Expedia') {
            expediaJobs.push({ ...jobRequest, otaProvider });
          } else if (otaProvider === 'Agoda') {
            agodaJobs.push({ ...jobRequest, otaProvider });
          } else if (otaProvider === 'Booking') {
            bookingJobs.push({
              jobId: jobRequest.jobId,
              otaProvider,
              propertyId: job.property_id,
            });
          } else {
            processedResults.push({
              jobId: jobRequest.jobId,
              otaProvider: 'Unknown',
              status: HttpStatus.BAD_REQUEST,
              message: `Unknown OTA provider: ${otaProvider}`,
              success: false,
              error: 'Invalid OTA provider',
            });
          }
        } catch (error: any) {
          processedResults.push({
            jobId: jobRequest.jobId,
            otaProvider: 'Unknown',
            status: HttpStatus.BAD_REQUEST,
            message: `Job with ID ${jobRequest.jobId} not found`,
            success: false,
          error: 'Invalid job_id',
        });
      }
    }

    // Push only Expedia jobs to AWS SQS queue
    await pushJobsToQueue(expediaJobsForSqs);

    // Update job statuses from Pending to InQueue for all Expedia jobs
    for (const job of expediaJobsForSqs) {
      await this.jobService.updateJob(job.id, { job_status: 'InQueue' });
    }

    // Wait for SQS messages to become visible before triggering Lambda
    if (expediaJobsForSqs.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      
      // Trigger Lambda function after pushing Expedia jobs to queue (lowercase platform name)
      await triggerLambda('expedia');
    }

    // Process Expedia DB jobs using bulk API
    if (expediaDbJobs.length > 0) {
        try {
          const dbUrl = this.getExpediaDbUrl();

          if (!dbUrl) {
             for (const job of expediaDbJobs) {
               processedResults.push({
                jobId: job.jobId,
                otaProvider: 'Expedia',
                billingType: 'DB',
                status: HttpStatus.SERVICE_UNAVAILABLE,
                message: 'No Expedia DB server URL configured',
                success: false,
                error: 'Expedia DB server URL not configured',
               });
             }
          } else {
            const bulkRequestBody = {
               job_ids: expediaDbJobs.map(j => j.jobId),
            };

            const response = await firstValueFrom(
              this.httpService.post(
                `${dbUrl}/api/expedia/bulk-db-run-job`,
                bulkRequestBody,
                {
                  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                  timeout: 300000,
                },
              ),
            );

            // Process response
            if (response.data?.results && Array.isArray(response.data.results)) {
               processedResults.push(...response.data.results);
            } else {
               // Fallback if no detailed results
               for (const job of expediaDbJobs) {
                 processedResults.push({
                   jobId: job.jobId,
                   otaProvider: 'Expedia',
                   billingType: 'DB',
                   status: response.status,
                   message: response.data?.message || 'Bulk DB job run successfully',
                   success: response.data?.success !== false,
                   data: response.data
                 });
               }
            }
          }
        } catch (error: any) {
          const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
          const errorMessage = error.response?.data?.message || error.message || 'Unknown error occurred';
          for (const job of expediaDbJobs) {
            processedResults.push({
              jobId: job.jobId,
              otaProvider: 'Expedia',
              billingType: 'DB',
              status,
              message: errorMessage,
              success: false,
              error: errorMessage,
            });
          }
        }
      }

      // Process Expedia Property jobs - jobs already pushed to queue, just return success
      if (expediaJobs.length > 0) {
         // Jobs already pushed to SQS queue above, just return success for each
         for (const job of expediaJobs) {
           processedResults.push({
             jobId: job.jobId,
             otaProvider: 'Expedia',
             status: HttpStatus.OK,
             message: 'Job successfully queued for processing',
             success: true,
             data: {
               status: 'queued',
             },
           });
         }
      }

      // Process Agoda Jobs
      if (agodaJobs.length > 0) {
        try {
          const agodaUrl = this.getUrlByOtaProvider('Agoda');
          if (!agodaUrl) {
             for (const job of agodaJobs) processedResults.push({ jobId: job.jobId, otaProvider: 'Agoda', status: HttpStatus.SERVICE_UNAVAILABLE, success: false, message: 'Agoda URL invalid' });
          } else {
             // Update URLs
             for (const job of agodaJobs) this.jobItemService.updateJobCurrentUrl(job.jobId, agodaUrl).catch(e => console.error(e));

             const bulkRequestBody = { job_ids: agodaJobs.map(j => j.jobId) };
             const response = await firstValueFrom(
               this.httpService.post(`${agodaUrl}/api/agoda/bulk-property-run-job`, bulkRequestBody, {
                 headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                 timeout: 300000
               })
             );
             if (response.data?.results && Array.isArray(response.data.results)) {
                processedResults.push(...response.data.results);
             } else {
                for (const job of agodaJobs) processedResults.push({ jobId: job.jobId, otaProvider: 'Agoda', status: response.status, success: true, message: 'Bulk Agoda run success' });
             }
          }
        } catch (error: any) {
           const status = error.response?.status || 500;
           for (const job of agodaJobs) processedResults.push({ jobId: job.jobId, otaProvider: 'Agoda', status, success: false, message: error.message });
        }
      }

      // Process Booking Jobs
      if (bookingJobs.length > 0) {
        if (options.bookingGroupByCredentials) {
          const bookingUrl = this.getUrlByOtaProvider('Booking');
          if (!bookingUrl) {
            for (const job of bookingJobs) {
              processedResults.push({
                jobId: job.jobId,
                otaProvider: 'Booking',
                status: HttpStatus.SERVICE_UNAVAILABLE,
                success: false,
                message: 'Booking URL invalid',
              });
            }
          } else {
            const bookingRows =
              await this.bookingBulkDispatchService.dispatchGroupedBulkRuns(
                bookingJobs.map((j) => ({
                  jobId: j.jobId,
                  propertyId: j.propertyId,
                })),
                bookingUrl,
                (jobId, url) =>
                  this.jobItemService.updateJobCurrentUrl(jobId, url),
                { scheduledJobId: body.scheduled_job_id },
              );
            processedResults.push(...bookingRows);
          }
        } else {
          try {
            const bookingUrl = this.getUrlByOtaProvider('Booking');
            if (!bookingUrl) {
              for (const job of bookingJobs) {
                processedResults.push({
                  jobId: job.jobId,
                  otaProvider: 'Booking',
                  status: HttpStatus.SERVICE_UNAVAILABLE,
                  success: false,
                  message: 'Booking URL invalid',
                });
              }
            } else {
              for (const job of bookingJobs) {
                this.jobItemService
                  .updateJobCurrentUrl(job.jobId, bookingUrl)
                  .catch((e) => console.error(e));
              }

              const bulkRequestBody = {
                job_ids: bookingJobs.map((j) => j.jobId),
              };
              const response = await firstValueFrom(
                this.httpService.post(
                  `${bookingUrl}/api/booking/bulk-property-run-job`,
                  bulkRequestBody,
                  {
                    headers: {
                      'Content-Type': 'application/json',
                      Accept: 'application/json',
                    },
                    timeout: 300000,
                  },
                ),
              );
              if (
                response.data?.results &&
                Array.isArray(response.data.results)
              ) {
                processedResults.push(...response.data.results);
              } else {
                for (const job of bookingJobs) {
                  processedResults.push({
                    jobId: job.jobId,
                    otaProvider: 'Booking',
                    status: response.status,
                    success: true,
                    message: 'Bulk Booking run success',
                  });
                }
              }
            }
          } catch (error: any) {
            const status = error.response?.status || 500;
            for (const job of bookingJobs) {
              processedResults.push({
                jobId: job.jobId,
                otaProvider: 'Booking',
                status,
                success: false,
                message: error.message,
              });
            }
          }
        }
      }

      const successfulJobs = processedResults.filter(
        (result) => result.success,
      ).length;
      const failedJobs = processedResults.length - successfulJobs;

      const responseData = {
        status: HttpStatus.OK,
        message: `Batch processing completed: ${successfulJobs} successful, ${failedJobs} failed`,
        results: processedResults,
        totalJobs: body.jobs.length,
        successfulJobs,
        failedJobs,
      };

      return res.status(HttpStatus.OK).json(responseData);
    } catch (error: any) {
      console.error('Batch property run job error:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Error processing batch jobs',
        error: error.message || 'Unknown error occurred',
      });
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
      'Rerun a job that has failed or partially completed for any OTA provider (Expedia, Agoda, Booking). Requires startDate, endDate, and jobId in request body. The system automatically determines the OTA provider from the job record and routes to the appropriate scraper server. The scraping mode is set based on EXPEDIA_MODE environment variable (Booking and Agoda use fixed endpoints).',
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

      // Determine scraping_mode based on OTA provider and environment variable
      const scrapingMode = this.getScrapingMode(otaProvider);

      // Create complete request body with all required fields
      const completeRequestBody = {
        startDate: body.startDate,
        endDate: body.endDate,
        jobId: body.jobId,
        ota_provider: otaProvider, // Get from job record
        scraping_mode: scrapingMode, // Get from environment variable
        scraperUrl: selectedUrl, // For internal routing
      };

      // Get the correct API path based on OTA provider
      const apiPath = this.getApiPathByOtaProvider(
        otaProvider,
        'rerun-failed-job',
      );

      const response = await firstValueFrom(
        this.httpService.post(`${selectedUrl}${apiPath}`, completeRequestBody, {
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
    description:
      'Get scraped reservation data for a specific job.\n\n' +
      'Each item also carries two Expedia-only derived fields used by the ' +
      'chargeback dashboard:\n' +
      '- `over_160` (boolean | null): `true` when (today − check_out_date) ' +
      'is more than 160 days. `null` for Booking / Agoda or when ' +
      'check_out_date is missing.\n' +
      '- `days_since_checkout` (number | null): whole-day count from ' +
      'check_out_date to today. `null` for Booking / Agoda or when ' +
      'check_out_date is missing.\n\n' +
      'These values are lazily refreshed once per day on the first read, ' +
      'so the response always reflects the current calendar day.',
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
      'Get all scraped reservation data for a specific job (no pagination ' +
      'or filtering).\n\n' +
      'Each item also carries two Expedia-only derived fields used by the ' +
      'chargeback dashboard:\n' +
      '- `over_160` (boolean | null): `true` when (today − check_out_date) ' +
      'is more than 160 days. `null` for Booking / Agoda or when ' +
      'check_out_date is missing.\n' +
      '- `days_since_checkout` (number | null): whole-day count from ' +
      'check_out_date to today. `null` for Booking / Agoda or when ' +
      'check_out_date is missing.\n\n' +
      'These values are lazily refreshed once per day on the first read, ' +
      'so the response always reflects the current calendar day.',
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
      'Start a new GraphQL property scraping job for any OTA provider (Expedia, Agoda, Booking). The system automatically determines the OTA provider from the job record and routes to the appropriate scraper server. This endpoint is primarily used when EXPEDIA_MODE is set to "graphql". Note: Booking and Agoda primarily use property-run-job endpoint.',
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
      // Fetch job details to get OTA provider and billing_type
      const job = await this.jobService.getJobById(body.jobId);
      const otaProvider = job.ota_provider || 'Expedia'; // Default to Expedia
      const billingType = job.billing_type;

      // Check if billing_type is 'DB' and route to DB server
      if (billingType === 'DB') {
        selectedUrl = this.getExpediaDbUrl();

        if (!selectedUrl) {
          return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
            success: false,
            message:
              'No Expedia DB server URL configured (EXPEDIA_DB_SERVER_URL)',
            error: 'Expedia DB server URL not configured',
          });
        }

        if (!this.validateDbDatesNotFuture(body, res)) {
          return;
        }

        // Add the selected URL to the request body
        const enhancedBody = {
          ...this.toScraperPropertyRunJobBody(body),
          scraperUrl: selectedUrl,
        };

        console.log(`Using Expedia DB server for billing_type=DB`);

        const response = await firstValueFrom(
          this.httpService.post(
            `${selectedUrl}/api/expedia/db-run-job`,
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
      }

      // Regular flow for non-DB billing types
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
        ...this.toScraperPropertyRunJobBody(body),
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

  @Post('/api/retrieval/property-run-job')
  @ApiOperation({
    summary: 'Start retrieval property scraping job',
    description:
      'Start a new property scraping job using the retrieval server based on OTA provider (Expedia or Agoda). The OTA provider is automatically determined from the retrieval record. This endpoint uses EXPEDIA_RETRIVAL_SERVER_URL for Expedia or AGODA_SERVER_URL for Agoda. Unlike regular scraper endpoints, this does not require startDate and endDate.',
  })
  @ApiBody({ type: RetrievalRunJobRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Property scraping job completed successfully',
    type: PropertyRunJobResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Missing required parameters or retrieval not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Scraping job already running',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 503,
    description: 'Retrieval server URL not configured for the OTA provider',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Error processing property search',
    type: ErrorResponseDto,
  })
  async expediadRetrievalPropertyRunJob(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: RetrievalRunJobRequestDto,
  ) {
    let selectedUrl: string | null = null;

    try {
      // Fetch retrieval details to get OTA provider
      if (!body.retrieval_id) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: 'retrieval_id is required',
          error: 'Missing retrieval_id in request body',
        });
      }

      let otaProvider = 'Expedia'; // Default fallback
      try {
        const retrieval = await this.retrievalService.getRetrievalById(
          body.retrieval_id,
        );
        otaProvider = retrieval.ota_provider || 'Expedia';
      } catch (error) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: `Retrieval with ID ${body.retrieval_id} not found`,
          error: 'Invalid retrieval_id',
        });
      }

      // Get retrieval URL based on OTA provider
      selectedUrl = this.getRetrievalUrlByOtaProvider(otaProvider);

      if (!selectedUrl) {
        const configKey =
          otaProvider === 'Expedia'
            ? 'EXPEDIA_RETRIVAL_SERVER_URL'
            : otaProvider === 'Agoda'
              ? 'AGODA_SERVER_URL'
              : 'RETRIEVAL_SERVER_URL';
        return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
          success: false,
          message: `No ${otaProvider} retrieval server URL configured (${configKey})`,
          error: `${otaProvider} retrieval server URL not configured`,
        });
      }

      // Add the selected URL to the request body
      const enhancedBody = {
        ...body,
        scraperUrl: selectedUrl,
        ota_provider: otaProvider,
      };

      // Determine the API path based on OTA provider and EXPEDIA_MODE
      let apiPath: string;
      if (otaProvider === 'Expedia') {
        const expediadMode = this.configService.get<string>('EXPEDIA_MODE');
        apiPath =
          expediadMode === 'graphql'
            ? '/api/expedia/graphql-retrieval-run-job'
            : '/api/expedia/retrieval-run-job';
        console.log(
          `Using Expedia retrieval server with ${expediadMode || 'scraper'} mode: ${apiPath}`,
        );
      } else if (otaProvider === 'Agoda') {
        apiPath = '/api/agoda/retrieval-run-job';
        console.log(`Using Agoda retrieval server: ${apiPath}`);
      } else {
        // Default to Expedia path for unknown providers
        const expediadMode = this.configService.get<string>('EXPEDIA_MODE');
        apiPath =
          expediadMode === 'graphql'
            ? '/api/expedia/graphql-retrieval-run-job'
            : '/api/expedia/retrieval-run-job';
        console.log(
          `Unknown OTA provider ${otaProvider}, defaulting to Expedia retrieval path: ${apiPath}`,
        );
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
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        'Retrieval server error';
      const data = error.response?.data || {
        message: errorMessage,
        error: 'Failed to start retrieval property scraping job',
      };
      return res.status(status).json(data);
    }
  }

  @Post('/api/batch-retrieval-run-job')
  @ApiOperation({
    summary: 'Start batch retrieval scraping jobs',
    description:
      'Execute multiple retrieval scraping jobs in batch. Each job is automatically routed to the appropriate retrieval server (Expedia or Agoda) based on the OTA provider of the retrieval. Both Expedia and Agoda jobs are processed using bulk API calls (bulk-retrieval-run-job) with all retrieval_ids in a single request. For Expedia jobs, the EXPEDIA_MODE environment variable determines whether to use GraphQL or regular scraper endpoint.',
  })
  @ApiBody({ type: BatchRetrievalRunJobRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Batch retrieval scraping jobs completed',
    type: BatchRetrievalRunJobResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request body or missing job data',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Error processing batch retrieval jobs',
    type: ErrorResponseDto,
  })
  async batchRetrievalRunJob(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: BatchRetrievalRunJobRequestDto,
  ) {
    try {
      if (!body.jobs || body.jobs.length === 0) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: 'No jobs provided in request',
          error: 'Jobs array is required and cannot be empty',
        });
      }

      const processedResults = [];

      // First, group jobs by OTA provider
      const expediaJobs: typeof body.jobs = [];
      const agodaJobs: typeof body.jobs = [];

      // Fetch OTA providers for all jobs
      for (const retrievalRequest of body.jobs) {
        try {
          const retrieval = await this.retrievalService.getRetrievalById(
            retrievalRequest.retrieval_id,
          );
          const otaProvider = retrieval.ota_provider || 'Expedia';

          if (otaProvider === 'Expedia') {
            expediaJobs.push(retrievalRequest);
          } else if (otaProvider === 'Agoda') {
            agodaJobs.push(retrievalRequest);
          }
        } catch (error) {
          processedResults.push({
            jobId: retrievalRequest.retrieval_id,
            otaProvider: 'Unknown',
            status: HttpStatus.BAD_REQUEST,
            message: `Retrieval with ID ${retrievalRequest.retrieval_id} not found`,
            success: false,
            error: 'Invalid retrieval_id',
          });
        }
      }

      // Process Expedia jobs using bulk API
      if (expediaJobs.length > 0) {
        try {
          // Get Expedia retrieval URL
          const expediaUrl = this.getRetrievalUrlByOtaProvider('Expedia');

          if (!expediaUrl) {
            // Mark all Expedia jobs as failed
            for (const retrievalRequest of expediaJobs) {
              processedResults.push({
                jobId: retrievalRequest.retrieval_id,
                otaProvider: 'Expedia',
                status: HttpStatus.SERVICE_UNAVAILABLE,
                message: `No Expedia retrieval server URL configured (EXPEDIA_RETRIVAL_SERVER_URL)`,
                success: false,
                error: 'Expedia retrieval server URL not configured',
              });
            }
          } else {
            // Collect all Expedia retrieval IDs
            const retrievalIds = expediaJobs.map((job) => job.retrieval_id);

            // Determine the API path based on EXPEDIA_MODE
            const expediadMode = this.configService.get<string>('EXPEDIA_MODE');
            const apiPath =
              expediadMode === 'graphql'
                ? '/api/expedia/bulk-graphql-retrieval-run-job'
                : '/api/expedia/bulk-retrieval-run-job';
            console.log(
              `[Batch Retrieval] Processing ${expediaJobs.length} Expedia retrievals using bulk API with ${expediadMode || 'scraper'} mode: ${apiPath}`,
            );

            // Call bulk-retrieval-run-job API
            const bulkRequestBody = {
              retrieval_ids: retrievalIds,
            };

            const response = await firstValueFrom(
              this.httpService.post(
                `${expediaUrl}${apiPath}`,
                bulkRequestBody,
                {
                  headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                  },
                  timeout: 300000, // 5 minute timeout for long-running scraping jobs
                },
              ),
            );

            // Process bulk response - if it returns individual results, use them
            // Otherwise, mark all as successful
            if (
              response.data?.results &&
              Array.isArray(response.data.results)
            ) {
              // If the bulk API returns individual results, use them
              for (const result of response.data.results) {
                processedResults.push({
                  jobId: result.retrieval_id || result.jobId,
                  otaProvider: 'Expedia',
                  status: result.status || response.status,
                  message: result.message || 'Retrieval run successfully',
                  success: result.success !== false,
                  data: result.data,
                  error: result.error,
                });
              }
            } else {
              // If bulk API doesn't return individual results, mark all as successful
              for (const retrievalRequest of expediaJobs) {
                processedResults.push({
                  jobId: retrievalRequest.retrieval_id,
                  otaProvider: 'Expedia',
                  status: response.status,
                  message:
                    response.data?.message || 'Bulk retrieval run successfully',
                  success: true,
                  data: response.data,
                });
              }
            }
          }
        } catch (error: any) {
          const status =
            error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
          const errorMessage =
            error.response?.data?.message ||
            error.message ||
            'Unknown error occurred';

          // Mark all Expedia jobs as failed
          for (const retrievalRequest of expediaJobs) {
            processedResults.push({
              jobId: retrievalRequest.retrieval_id,
              otaProvider: 'Expedia',
              status,
              message: errorMessage,
              success: false,
              error: errorMessage,
            });
          }
        }
      }

      // Process Agoda jobs using bulk API
      if (agodaJobs.length > 0) {
        try {
          // Get Agoda retrieval URL
          const agodaUrl = this.getRetrievalUrlByOtaProvider('Agoda');

          if (!agodaUrl) {
            // Mark all Agoda jobs as failed
            for (const retrievalRequest of agodaJobs) {
              processedResults.push({
                jobId: retrievalRequest.retrieval_id,
                otaProvider: 'Agoda',
                status: HttpStatus.SERVICE_UNAVAILABLE,
                message: `No Agoda retrieval server URL configured (AGODA_RETRIVAL_SERVER_URL)`,
                success: false,
                error: 'Agoda retrieval server URL not configured',
              });
            }
          } else {
            // Collect all Agoda retrieval IDs
            const retrievalIds = agodaJobs.map((job) => job.retrieval_id);

            console.log(
              `[Batch Retrieval] Processing ${agodaJobs.length} Agoda retrievals using bulk API`,
            );

            // Call bulk-retrieval-run-job API
            const bulkRequestBody = {
              retrieval_ids: retrievalIds,
            };

            const response = await firstValueFrom(
              this.httpService.post(
                `${agodaUrl}/api/agoda/bulk-retrieval-run-job`,
                bulkRequestBody,
                {
                  headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                  },
                  timeout: 300000, // 5 minute timeout for long-running scraping jobs
                },
              ),
            );

            // Process bulk response - if it returns individual results, use them
            // Otherwise, mark all as successful
            if (
              response.data?.results &&
              Array.isArray(response.data.results)
            ) {
              // If the bulk API returns individual results, use them
              for (const result of response.data.results) {
                processedResults.push({
                  jobId: result.retrieval_id || result.jobId,
                  otaProvider: 'Agoda',
                  status: result.status || response.status,
                  message: result.message || 'Retrieval run successfully',
                  success: result.success !== false,
                  data: result.data,
                  error: result.error,
                });
              }
            } else {
              // If bulk API doesn't return individual results, mark all as successful
              for (const retrievalRequest of agodaJobs) {
                processedResults.push({
                  jobId: retrievalRequest.retrieval_id,
                  otaProvider: 'Agoda',
                  status: response.status,
                  message:
                    response.data?.message || 'Bulk retrieval run successfully',
                  success: true,
                  data: response.data,
                });
              }
            }
          }
        } catch (error: any) {
          const status =
            error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
          const errorMessage =
            error.response?.data?.message ||
            error.message ||
            'Unknown error occurred';

          // Mark all Agoda jobs as failed
          for (const retrievalRequest of agodaJobs) {
            processedResults.push({
              jobId: retrievalRequest.retrieval_id,
              otaProvider: 'Agoda',
              status,
              message: errorMessage,
              success: false,
              error: errorMessage,
            });
          }
        }
      }

      const successfulJobs = processedResults.filter(
        (result) => result.success,
      ).length;
      const failedJobs = processedResults.length - successfulJobs;

      const responseData = {
        status: HttpStatus.OK,
        message: `Batch retrieval processing completed: ${successfulJobs} successful, ${failedJobs} failed`,
        results: processedResults,
        totalJobs: body.jobs.length,
        successfulJobs,
        failedJobs,
      };

      return res.status(HttpStatus.OK).json(responseData);
    } catch (error: any) {
      console.error('Batch retrieval run job error:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Error processing batch retrieval jobs',
        error: error.message || 'Unknown error occurred',
      });
    }
  }

  @Post('/scheduled')
  @UseGuards(JwtAuthGuard)
  @ValidateBody(createScheduledJobSchema)
  @ApiOperation({ summary: 'Create or update scheduled job' })
  @ApiResponse({
    status: 200,
    description: 'Scheduled job created or updated successfully',
    type: CreateScheduledJobResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createOrUpdateScheduledJob(
    @Body() createScheduledJobDto: CreateScheduledJobDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result =
          await this.scheduledJobService.createOrUpdateScheduledJob(
            createScheduledJobDto.date,
            createScheduledJobDto.job_ids || [],
            createScheduledJobDto.retrieval_ids || [],
          );
        const jobMessage =
          result.addedCount > 0 || result.skippedCount > 0
            ? `${result.addedCount} job(s) added, ${result.skippedCount} job(s) skipped.`
            : '';
        const retrievalMessage =
          result.addedRetrievalCount > 0 || result.skippedRetrievalCount > 0
            ? `${result.addedRetrievalCount} retrieval(s) added, ${result.skippedRetrievalCount} retrieval(s) skipped.`
            : '';
        return {
          statusCode: 200,
          message:
            `Scheduled job ${result.addedCount > 0 || result.addedRetrievalCount > 0 ? 'created/updated' : 'updated'} successfully. ${jobMessage}${retrievalMessage}`.trim(),
          data: result,
        };
      },
      this.logger,
    );
  }

  @Get('/scheduled/:date')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get scheduled job by date' })
  @ApiResponse({
    status: 200,
    description: 'Returns scheduled job for the date',
    type: ScheduledJobResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Scheduled job not found' })
  async getScheduledJobByDate(
    @Param('date') date: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const scheduledJob =
          await this.scheduledJobService.getScheduledJobByDate(date);
        if (!scheduledJob) {
          return {
            statusCode: 404,
            message: 'Scheduled job not found for this date',
            data: null,
          };
        }
        return {
          statusCode: 200,
          message: 'Scheduled job retrieved successfully',
          data: scheduledJob,
        };
      },
      this.logger,
    );
  }

  @Get('/scheduled')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all scheduled jobs or filter by date range' })
  @ApiQuery({
    name: 'start_date',
    required: false,
    description: 'Start date in YYYY-MM-DD format',
    example: '2024-01-01',
  })
  @ApiQuery({
    name: 'end_date',
    required: false,
    description: 'End date in YYYY-MM-DD format',
    example: '2024-12-31',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns list of scheduled jobs',
    type: [ScheduledJobResponseDto],
  })
  async getScheduledJobs(
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Res() response?: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        let scheduledJobs: any[];

        if (startDate && endDate) {
          scheduledJobs =
            await this.scheduledJobService.getScheduledJobsByDateRange(
              startDate,
              endDate,
            );
        } else {
          scheduledJobs =
            await this.scheduledJobService.getAllScheduledJobs();
        }

        return {
          statusCode: 200,
          message: startDate && endDate
            ? `Scheduled jobs retrieved successfully for date range ${startDate} to ${endDate}`
            : 'Scheduled jobs retrieved successfully',
          data: scheduledJobs,
        };
      },
      this.logger,
    );
  }

  @Delete('/scheduled/jobs')
  @UseGuards(JwtAuthGuard)
  @ValidateBody(removeJobsFromScheduledJobSchema)
  @ApiOperation({ summary: 'Remove jobs from scheduled job' })
  @ApiResponse({
    status: 200,
    description: 'Jobs removed from scheduled job successfully',
    type: RemoveJobsFromScheduledJobResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Scheduled job not found' })
  async removeJobsFromScheduledJob(
    @Body() removeJobsDto: RemoveJobsFromScheduledJobDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result =
          await this.scheduledJobService.removeJobsFromScheduledJob(
            removeJobsDto.date,
            removeJobsDto.job_ids || [],
            removeJobsDto.retrieval_ids || [],
          );

        const jobMessage =
          result.removedCount > 0 || result.notFoundCount > 0
            ? `${result.removedCount} job(s) removed, ${result.notFoundCount} job(s) not found.`
            : '';
        const retrievalMessage =
          result.removedRetrievalCount > 0 ||
          result.notFoundRetrievalCount > 0
            ? `${result.removedRetrievalCount} retrieval(s) removed, ${result.notFoundRetrievalCount} retrieval(s) not found.`
            : '';

        const scheduledJobDeleted =
          result.scheduledJob === null ? ' Scheduled job deleted as it became empty.' : '';

        return {
          statusCode: 200,
          message: `Jobs removed from scheduled job successfully. ${jobMessage}${retrievalMessage}${scheduledJobDeleted}`.trim(),
          data: result,
        };
      },
      this.logger,
    );
  }

  @Post('/scheduled/remove-jobs')
  @UseGuards(JwtAuthGuard)
  @ValidateBody(removeJobIdsFromAllScheduledJobsSchema)
  @ApiOperation({
    summary: 'Remove job IDs from all scheduled jobs',
    description:
      'Removes the specified job IDs from all scheduled jobs across all dates',
  })
  @ApiResponse({
    status: 200,
    description: 'Job IDs removed from all scheduled jobs successfully',
    type: RemoveJobIdsFromAllScheduledJobsResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async removeJobIdsFromAllScheduledJobs(
    @Body() removeJobsDto: RemoveJobIdsFromAllScheduledJobsDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result =
          await this.scheduledJobService.removeJobIdsFromAllScheduledJobs(
            removeJobsDto.job_ids,
          );

        const message = `Successfully removed ${result.totalRemovedCount} job(s) from scheduled jobs. ${
          result.notFoundCount > 0
            ? `${result.notFoundCount} job ID(s) were not found in any scheduled job.`
            : ''
        }${
          result.deletedScheduledJobsCount > 0
            ? ` ${result.deletedScheduledJobsCount} scheduled job(s) were deleted as they became empty.`
            : ''
        }`.trim();

        return {
          statusCode: 200,
          message,
          data: result,
        };
      },
      this.logger,
    );
  }
}
