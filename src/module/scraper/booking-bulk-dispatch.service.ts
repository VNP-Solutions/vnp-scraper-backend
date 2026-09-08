import { HttpService } from '@nestjs/axios';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { DatabaseService } from '../database/database.service';
import { IPropertyCredentialsService } from '../property-credentials/property-credentials.interface';

export type BookingJobForBulk = {
  jobId: string;
  propertyId: string | null | undefined;
};

export type BookingBulkProcessedRow = {
  jobId: string;
  otaProvider: 'Booking';
  status: number;
  message: string;
  success: boolean;
  data?: unknown;
  error?: string;
};

type CredentialGroup = {
  job_ids: string[];
  phone_number: string | null;
  slot: number | null;
  booking_username: string;
  booking_password: string;
};

type JobPropertyRef = { jobId: string; propertyId: string };

type CredentialGroupBucket = {
  refs: JobPropertyRef[];
  booking_username: string;
  booking_password: string;
};

@Injectable()
export class BookingBulkDispatchService {
  private readonly logger = new Logger(BookingBulkDispatchService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
    @Inject('IPropertyCredentialsService')
    private readonly propertyCredentialsService: IPropertyCredentialsService,
  ) {}

  /**
   * Path on the Booking scraper host for credential-grouped bulk runs.
   * Override with env BOOKING_GROUPED_BULK_API_PATH (must start with /).
   */
  private getGroupedBookingBulkApiPath(): string {
    const raw = this.configService
      .get<string>('BOOKING_GROUPED_BULK_API_PATH')
      ?.trim();
    if (raw) {
      return raw.startsWith('/') ? raw : `/${raw}`;
    }
    return '/api/booking/bulk-property-run-job';
  }

  /** Log JSON body sent to BOOKING_GROUPED_BULK_API_PATH when not production or BOOKING_BULK_DEBUG_LOG=true */
  private isBookingBulkBodyLogEnabled(): boolean {
    if (this.configService.get<string>('BOOKING_BULK_DEBUG_LOG') === 'true') {
      return true;
    }
    return this.configService.get<string>('NODE_ENV') !== 'production';
  }

  /** Extra: response body on success + full error payload (only when BOOKING_BULK_DEBUG_LOG=true) */
  private isBookingBulkVerboseDebug(): boolean {
    return this.configService.get<string>('BOOKING_BULK_DEBUG_LOG') === 'true';
  }

  /**
   * Groups Booking jobs by decrypted bookingUsername + bookingPassword + property portfolio
   * (same credentials in different portfolios → separate groups), then one POST to Booking.
   * Body includes optional scheduled_job_id (top-level and repeated per credential_groups item).
   * phone_number and slot on each credential group come from the Job documents, not Property.
   */
  async dispatchGroupedBulkRuns(
    bookingJobs: BookingJobForBulk[],
    bookingUrl: string,
    updateJobCurrentUrl: (jobId: string, url: string) => Promise<void>,
    options?: { scheduledJobId?: string | null },
  ): Promise<BookingBulkProcessedRow[]> {
    const out: BookingBulkProcessedRow[] = [];

    const { groups, failedJobs } = await this.buildCredentialGroups(bookingJobs);

    for (const f of failedJobs) {
      out.push({
        jobId: f.jobId,
        otaProvider: 'Booking',
        status: HttpStatus.BAD_REQUEST,
        message: f.message,
        success: false,
        error: f.message,
      });
    }

    if (groups.length === 0) {
      return out;
    }

    const allJobIds = groups.flatMap((g) => g.job_ids);
    for (const jobId of allJobIds) {
      updateJobCurrentUrl(jobId, bookingUrl).catch((e) =>
        this.logger.warn(`updateJobCurrentUrl ${jobId}: ${e?.message}`),
      );
    }

    const bulkPath = this.getGroupedBookingBulkApiPath();
    const bulkEndpoint = `${bookingUrl.replace(/\/$/, '')}${bulkPath}`;

    this.logger.log(
      `Booking bulk (single POST): ${bookingJobs.length} job(s) → ${groups.length} credential group(s) → ${bulkPath}`,
    );

    const schedId =
      options?.scheduledJobId != null &&
      String(options.scheduledJobId).trim() !== ''
        ? String(options.scheduledJobId).trim()
        : null;

    // Always use credential_groups[] so the Booking scraper (e.g. bulk-property-run-job-grouped) has one shape for 1 or N groups.
    const bulkRequestBody = {
      scheduled_job_id: schedId,
      credential_groups: groups.map((g) => ({
        job_ids: g.job_ids,
        phone_number: g.phone_number,
        slot: g.slot,
        booking_username: g.booking_username,
        booking_password: g.booking_password,
        scheduled_job_id: schedId,
      })),
    };

    if (this.isBookingBulkBodyLogEnabled()) {
      console.log(
        `[BookingBulkDispatch] POST body → ${bulkPath} (${bulkEndpoint})\n${JSON.stringify(
          bulkRequestBody,
          null,
          2,
        )}`,
      );
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          bulkEndpoint,
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

      if (this.isBookingBulkVerboseDebug()) {
        console.log('[BookingBulkDispatch] RESPONSE status', response.status);
        try {
          console.log(
            '[BookingBulkDispatch] RESPONSE data',
            JSON.stringify(response.data, null, 2),
          );
        } catch {
          console.log('[BookingBulkDispatch] RESPONSE data (raw)', response.data);
        }
      }

      if (response.data?.results && Array.isArray(response.data.results)) {
        out.push(
          ...response.data.results.map((result: Record<string, unknown>) => ({
            jobId: String(result.jobId ?? result.job_id ?? ''),
            otaProvider: 'Booking' as const,
            status: (result.status as number) || response.status,
            message: String(result.message || 'Bulk Booking run processed'),
            success: result.success !== false,
            data: result.data,
            error: result.error as string | undefined,
          })),
        );
      } else {
        for (const jobId of allJobIds) {
          out.push({
            jobId,
            otaProvider: 'Booking',
            status: response.status,
            success: true,
            message:
              (response.data as { message?: string })?.message ||
              'Bulk Booking run success',
            data: response.data,
          });
        }
      }
    } catch (error: unknown) {
      if (this.isBookingBulkBodyLogEnabled()) {
        const e = error as Error & {
          code?: string;
          response?: { status?: number; data?: unknown };
        };
        const httpStatus = e.response?.status;
        const hint =
          httpStatus != null
            ? `HTTP ${httpStatus}`
            : 'no HTTP response (wrong BOOKING_SERVER_URL, connection refused, timeout, DNS, etc.)';
        const msg = (e?.message && e.message.trim()) || String(error);
        console.log(
          `[BookingBulkDispatch] POST to ${bulkPath} failed: ${msg}${e.code ? ` [${e.code}]` : ''} | ${hint}`,
        );
        if (e.response?.data !== undefined && this.isBookingBulkVerboseDebug()) {
          try {
            console.log(
              '[BookingBulkDispatch] error response body',
              JSON.stringify(e.response.data, null, 2),
            );
          } catch {
            console.log(
              '[BookingBulkDispatch] error response body (raw)',
              e.response.data,
            );
          }
        }
      }

      const err = error as {
        response?: { status?: number };
        message?: string;
      };
      const status = err.response?.status || 500;
      const message = err.message || 'Booking bulk request failed';
      for (const jobId of allJobIds) {
        out.push({
          jobId,
          otaProvider: 'Booking',
          status,
          message,
          success: false,
          error: message,
        });
      }
    }

    return out;
  }

  private async resolvePhoneSlotForCredentialGroup(
    entries: JobPropertyRef[],
  ): Promise<{ phone_number: string | null; slot: number | null }> {
    const uniqueJobIds = [...new Set(entries.map((e) => e.jobId))];
    if (uniqueJobIds.length === 0) {
      return { phone_number: null, slot: null };
    }

    type Row = {
      id: string;
      phone_number: string | null;
      slot: number | null;
    };
    const rows = await this.db.job.findMany({
      where: { id: { in: uniqueJobIds } },
      select: { id: true, phone_number: true, slot: true },
    });

    const byId = new Map(rows.map((r) => [r.id, r]));
    let first: { phone_number: string; slot: number } | null = null;

    for (const { jobId } of entries) {
      const job = byId.get(jobId);
      if (!job) {
        continue;
      }
      const phoneOk =
        job.phone_number != null && String(job.phone_number).trim() !== '';
      const slotOk = job.slot != null && !Number.isNaN(Number(job.slot));
      if (!phoneOk || !slotOk) {
        continue;
      }
      const phoneStr = String(job.phone_number).trim();
      const slotNum = Number(job.slot);
      if (!first) {
        first = { phone_number: phoneStr, slot: slotNum };
      } else if (
        first.phone_number !== phoneStr ||
        first.slot !== slotNum
      ) {
        this.logger.warn(
          `Booking credential group: jobs disagree on phone/slot; using first (${first.phone_number}, slot ${first.slot})`,
        );
      }
    }

    if (first) {
      return { phone_number: first.phone_number, slot: first.slot };
    }
    return { phone_number: null, slot: null };
  }

  private async buildCredentialGroups(bookingJobs: BookingJobForBulk[]): Promise<{
    groups: CredentialGroup[];
    failedJobs: Array<{ jobId: string; message: string }>;
  }> {
    const failedJobs: Array<{ jobId: string; message: string }> = [];
    const map = new Map<string, CredentialGroupBucket>();

    const uniquePropertyIds = [
      ...new Set(
        bookingJobs
          .map((j) => j.propertyId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const portfolioByPropertyId = new Map<string, string | null>();
    if (uniquePropertyIds.length > 0) {
      const props = await this.db.property.findMany({
        where: { id: { in: uniquePropertyIds } },
        select: { id: true, portfolio_id: true },
      });
      for (const p of props) {
        portfolioByPropertyId.set(p.id, p.portfolio_id ?? null);
      }
    }

    for (const { jobId, propertyId } of bookingJobs) {
      if (!propertyId) {
        failedJobs.push({
          jobId,
          message: 'Job has no property_id; cannot resolve Booking credentials',
        });
        continue;
      }

      const creds =
        await this.propertyCredentialsService.getPropertyCredentialsByPropertyId(
          propertyId,
        );

      if (!creds) {
        failedJobs.push({
          jobId,
          message: `No property credentials found for property ${propertyId}`,
        });
        continue;
      }

      const username = (creds.bookingUsername || '').trim();
      const passwordPlain = creds.bookingPassword
        ? this.propertyCredentialsService.decryptPassword(creds.bookingPassword)
        : '';

      if (!username || !passwordPlain) {
        failedJobs.push({
          jobId,
          message:
            'Missing Booking username or password (or password could not be decrypted)',
        });
        continue;
      }

      const portfolioId = portfolioByPropertyId.get(propertyId) ?? null;
      const portfolioKey = portfolioId ?? '';
      const key = `${username}\u0000${passwordPlain}\u0000${portfolioKey}`;
      let bucket = map.get(key);
      if (!bucket) {
        bucket = {
          refs: [],
          booking_username: username,
          booking_password: passwordPlain,
        };
        map.set(key, bucket);
      }
      bucket.refs.push({ jobId, propertyId });
    }

    const groups: CredentialGroup[] = [];
    for (const bucket of map.values()) {
      const { refs, booking_username, booking_password } = bucket;
      const job_ids = refs.map((e) => e.jobId);
      const { phone_number, slot } =
        await this.resolvePhoneSlotForCredentialGroup(refs);
      groups.push({
        job_ids,
        phone_number,
        slot,
        booking_username,
        booking_password,
      });
    }
    return { groups, failedJobs };
  }
}
