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

    setTimeout(() => {
      this.jobItemService
        .updateJobCurrentUrl(body.jobId, bookingUrl)
        .catch((e) =>
          this.logger.warn(
            `updateJobCurrentUrl failed for ${body.jobId}: ${e?.message}`,
          ),
        );
    }, 1000);

    const response = await firstValueFrom(
      this.httpService.post(
        `${bookingUrl}/api/booking/property-run-job`,
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

    return {
      status: response.status,
      data: response.data,
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
      const bookingRows =
        await this.bookingBulkDispatchService.dispatchGroupedBulkRuns(
          bookingJobs,
          bookingUrl,
          (jobId, url) => this.jobItemService.updateJobCurrentUrl(jobId, url),
          { scheduledJobId: body.scheduled_job_id },
        );
      processedResults.push(...bookingRows);
    }

    const successfulJobs = processedResults.filter((r) => r.success).length;
    const failedJobs = processedResults.length - successfulJobs;

    return {
      status: HttpStatus.OK,
      message: `Booking batch completed: ${successfulJobs} successful, ${failedJobs} failed`,
      results: processedResults,
      totalJobs: body.job_ids.length,
      successfulJobs,
      failedJobs,
      bookingUrl,
    };
  }
}
