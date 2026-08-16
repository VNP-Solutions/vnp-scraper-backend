import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { IBookingScraperUrlService } from '../booking-scraper-url/booking-scraper-url.interface';
import { IJobService } from '../job/job.interface';
import { BookingBulkDispatchService } from './booking-bulk-dispatch.service';
import {
  BookingBulkPropertyRunJobGroupedRequestDto,
  BookingPropertyRunJobRequestDto,
} from './booking-run.dto';
import { IScraperJobItemService } from './scraper-job-item.interface';

@Injectable()
export class BookingRunService {
  private readonly logger = new Logger(BookingRunService.name);

  constructor(
    private readonly httpService: HttpService,
    @Inject('IBookingScraperUrlService')
    private readonly bookingScraperUrlService: IBookingScraperUrlService,
    @Inject('IJobService')
    private readonly jobService: IJobService,
    @Inject('IScraperJobItemService')
    private readonly jobItemService: IScraperJobItemService,
    private readonly bookingBulkDispatchService: BookingBulkDispatchService,
  ) {}

  async runPropertyJob(body: BookingPropertyRunJobRequestDto) {
    const bookingUrl = await this.bookingScraperUrlService.getNormalizedUrlById(
      body.booking_scraper_url_id,
    );

    const job = await this.jobService.getJobById(body.jobId);
    if (job.ota_provider !== 'Booking') {
      throw new BadRequestException(
        `Job ${body.jobId} is not a Booking job (ota_provider=${job.ota_provider})`,
      );
    }

    const startDate = job.start_date?.trim();
    const endDate = job.end_date?.trim();
    if (!startDate || !endDate) {
      throw new BadRequestException(
        `Job ${body.jobId} is missing start_date or end_date`,
      );
    }

    const enhancedBody = {
      jobId: body.jobId,
      startDate,
      endDate,
      scraperUrl: bookingUrl,
    };

    this.jobItemService
      .updateJobCurrentUrl(body.jobId, bookingUrl)
      .catch((e) =>
        this.logger.warn(
          `updateJobCurrentUrl failed for ${body.jobId}: ${e?.message}`,
        ),
      );

    this.dispatchPropertyJobToScraper(bookingUrl, enhancedBody, body.jobId);

    return {
      status: HttpStatus.OK,
      data: {
        success: true,
        message: 'Job successfully queued for processing',
        data: {
          jobId: body.jobId,
          status: 'Running',
          otaProvider: 'Booking',
          bookingUrl,
        },
      },
      bookingUrl,
    };
  }

  async runBulkPropertyJobsGrouped(
    body: BookingBulkPropertyRunJobGroupedRequestDto,
  ) {
    const bookingUrl = await this.bookingScraperUrlService.getNormalizedUrlById(
      body.booking_scraper_url_id,
    );

    const bookingJobs: Array<{
      jobId: string;
      propertyId: string | null | undefined;
    }> = [];
    const processedResults: Array<Record<string, unknown>> = [];

    for (const jobId of body.job_ids) {
      try {
        const job = await this.jobService.getJobById(jobId);
        if (job.ota_provider !== 'Booking') {
          processedResults.push({
            jobId,
            otaProvider: job.ota_provider,
            status: HttpStatus.BAD_REQUEST,
            success: false,
            message: `Job is not a Booking job (ota_provider=${job.ota_provider})`,
          });
          continue;
        }

        bookingJobs.push({
          jobId,
          propertyId: job.property_id,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        processedResults.push({
          jobId,
          otaProvider: 'Booking',
          status: HttpStatus.BAD_REQUEST,
          success: false,
          message,
        });
      }
    }

    if (bookingJobs.length > 0) {
      for (const { jobId } of bookingJobs) {
        processedResults.push({
          jobId,
          otaProvider: 'Booking',
          status: HttpStatus.OK,
          success: true,
          message: 'Job queued for processing',
        });
      }

      this.dispatchGroupedBulkToScraper(
        bookingJobs,
        bookingUrl,
        body.scheduled_job_id,
      );
    }

    const successfulJobs = processedResults.filter((r) => r.success).length;
    const failedJobs = processedResults.length - successfulJobs;

    return {
      status: HttpStatus.OK,
      message: `Booking batch queued: ${successfulJobs} accepted, ${failedJobs} failed validation`,
      results: processedResults,
      totalJobs: body.job_ids.length,
      successfulJobs,
      failedJobs,
      bookingUrl,
    };
  }

  private dispatchPropertyJobToScraper(
    bookingUrl: string,
    body: {
      jobId: string;
      startDate: string;
      endDate: string;
      scraperUrl: string;
    },
    jobId: string,
  ): void {
    firstValueFrom(
      this.httpService.post(
        `${bookingUrl}/api/booking/property-run-job`,
        body,
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 300000,
        },
      ),
    )
      .then((response) => {
        this.logger.log(
          `Booking property-run-job dispatched for ${jobId}: HTTP ${response.status}`,
        );
      })
      .catch((error: unknown) => {
        const err = error as {
          message?: string;
          response?: { status?: number; data?: unknown };
        };
        this.logger.error(
          `Booking property-run-job failed for ${jobId}: ${err.message ?? error}${
            err.response?.status != null ? ` (HTTP ${err.response.status})` : ''
          }`,
        );
      });
  }

  private dispatchGroupedBulkToScraper(
    bookingJobs: Array<{
      jobId: string;
      propertyId: string | null | undefined;
    }>,
    bookingUrl: string,
    scheduledJobId?: string,
  ): void {
    void this.bookingBulkDispatchService
      .dispatchGroupedBulkRuns(
        bookingJobs,
        bookingUrl,
        (jobId, url) => this.jobItemService.updateJobCurrentUrl(jobId, url),
        { scheduledJobId },
      )
      .then((rows) => {
        const failed = rows.filter((r) => !r.success).length;
        this.logger.log(
          `Booking grouped bulk dispatched for ${bookingJobs.length} job(s): ${rows.length - failed} ok, ${failed} failed (async)`,
        );
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Booking grouped bulk dispatch failed: ${message}`,
          error instanceof Error ? error.stack : undefined,
        );
      });
  }
}
