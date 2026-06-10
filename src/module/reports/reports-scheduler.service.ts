import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { OTAProvider } from '@prisma/client';
import { CronJob } from 'cron';
import { EncryptionUtil } from '../../common/utils/encryption.util';
import { DatabaseService } from '../database/database.service';
import { MailService } from '../../common/utils/mail.service';
import { ReportsResultItem, IReportsService } from './reports.interface';

/** Default: every day at 12:00 noon (server local time). */
const DEFAULT_CRON_TIME = '0 0 12 * * *';

/** All statuses included in the daily CSV attachment. */
const ATTACHMENT_STATUSES = [
  'Running',
  'Completed',
  'Partial',
  'Failed',
  'Stopped',
  'InQueue',
  'NothingToReport',
  'Manual',
];

/** CSV columns included in the daily attachment. */
const CSV_HEADERS = [
  'Job ID',
  'Job Status',
  'Property Name',
  'OTA Property ID',
  'OTA Provider',
  'Billing Type',
  'Portfolio',
  'Batch',
  'Start Date',
  'End Date',
  'Failed Reason',
  'Username',
  'Password',
];

interface CredentialsRow {
  expediaUsername: string | null;
  expediaPassword: string | null;
  bookingUsername: string | null;
  bookingPassword: string | null;
  agodaUsername: string | null;
  agodaPassword: string | null;
}

@Injectable()
export class ReportsSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ReportsSchedulerService.name);

  constructor(
    @Inject('IReportsService')
    private readonly reportsService: IReportsService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly db: DatabaseService,
    private readonly encryptionUtil: EncryptionUtil,
  ) {}

  onModuleInit(): void {
    const cronTime =
      this.configService.get<string>('REPORT_STATISTICS_CRON_TIME') ||
      DEFAULT_CRON_TIME;

    const job = new CronJob(cronTime, () => {
      this.handleDailyStatisticsEmail();
    });

    this.schedulerRegistry.addCronJob('reportsDailyStatisticsEmail', job);
    job.start();

    this.logger.log(
      `Daily statistics email cron registered with schedule: "${cronTime}"`,
    );
  }

  async handleDailyStatisticsEmail(): Promise<void> {
    const recipientsEnv = this.configService.get<string>(
      'REPORT_STATISTICS_EMAIL_RECIPIENTS',
    );

    if (!recipientsEnv) {
      this.logger.warn(
        'REPORT_STATISTICS_EMAIL_RECIPIENTS is not set — skipping daily statistics email.',
      );
      return;
    }

    const recipients = recipientsEnv
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);

    if (!recipients.length) {
      this.logger.warn(
        'REPORT_STATISTICS_EMAIL_RECIPIENTS is empty after parsing — skipping.',
      );
      return;
    }

    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10); // "YYYY-MM-DD"

    const systemUser = { userId: 'system', role: 'admin' };

    const baseBody = {
      ota_providers: ['Agoda', 'Booking', 'Expedia'],
      job_types: ['VCC', 'DB'],
      run_within: { from: dateStr, to: dateStr },
      include_archived: false,
    };

    this.logger.log(
      `Running daily statistics email for ${dateStr} → [${recipients.join(', ')}]`,
    );

    try {
      // Fetch statistics and failed/NTR jobs concurrently.
      const [stats, failedResult] = await Promise.all([
        this.reportsService.getStatistics(baseBody as any, systemUser),
        this.reportsService.searchReports(
          { ...baseBody, job_statuses: ATTACHMENT_STATUSES, page: 1, limit: 10000 } as any,
          systemUser,
        ),
      ]);

      const failedJobs: ReportsResultItem[] = failedResult.data ?? [];

      let csvAttachment: { filename: string; content: string } | null = null;
      if (failedJobs.length > 0) {
        // Batch-fetch credentials for all unique property IDs in one query.
        const propertyIds = [
          ...new Set(failedJobs.map((j) => j.property_id).filter(Boolean)),
        ] as string[];

        const credentialsList = await this.db.propertyCredentials.findMany({
          where: { property_id: { in: propertyIds } },
          select: {
            property_id: true,
            expediaUsername: true,
            expediaPassword: true,
            bookingUsername: true,
            bookingPassword: true,
            agodaUsername: true,
            agodaPassword: true,
          },
        });

        // Map property_id → credentials (take first record per property).
        const credentialsMap = new Map<string, CredentialsRow>();
        for (const c of credentialsList) {
          if (!credentialsMap.has(c.property_id)) {
            credentialsMap.set(c.property_id, c);
          }
        }

        csvAttachment = {
          filename: `failed-nothing-to-report-jobs-${dateStr}.csv`,
          content: this.buildCsv(failedJobs, credentialsMap),
        };
      }

      await this.mailService.sendDailyStatisticsEmail({
        to: recipients,
        stats,
        date: dateStr,
        failedJobsCsv: csvAttachment,
      });

      this.logger.log(
        `Daily statistics email sent for ${dateStr}. Total jobs in CSV: ${failedJobs.length}.`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send daily statistics email for ${dateStr}: ${error?.message}`,
        error?.stack,
      );
    }
  }

  // ---------------------------------------------------------------------------

  private buildCsv(
    jobs: ReportsResultItem[],
    credentialsMap: Map<string, CredentialsRow>,
  ): string {
    const escape = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const resolveOtaPropertyId = (j: ReportsResultItem): string | number => {
      switch (j.ota_provider as OTAProvider) {
        case OTAProvider.Expedia: return j.property?.expedia_id ?? '';
        case OTAProvider.Booking: return j.property?.booking_id ?? '';
        case OTAProvider.Agoda:   return j.property?.agoda_id   ?? '';
        default:                  return '';
      }
    };

    const safeDecrypt = (encrypted: string | null): string => {
      if (!encrypted) return '';
      try {
        return this.encryptionUtil.decryptPassword(encrypted);
      } catch {
        return '';
      }
    };

    const resolveCredentials = (
      j: ReportsResultItem,
    ): { username: string; password: string } => {
      const creds = j.property_id ? credentialsMap.get(j.property_id) : null;
      if (!creds) return { username: '', password: '' };
      switch (j.ota_provider as OTAProvider) {
        case OTAProvider.Expedia:
          return { username: creds.expediaUsername ?? '', password: safeDecrypt(creds.expediaPassword) };
        case OTAProvider.Booking:
          return { username: creds.bookingUsername ?? '', password: safeDecrypt(creds.bookingPassword) };
        case OTAProvider.Agoda:
          return { username: creds.agodaUsername ?? '', password: safeDecrypt(creds.agodaPassword) };
        default:
          return { username: '', password: '' };
      }
    };

    const header = CSV_HEADERS.join(',');
    const rows = jobs.map((j) => {
      const { username, password } = resolveCredentials(j);
      return [
        j.id,
        j.job_status,
        j.property_name,
        resolveOtaPropertyId(j),
        j.ota_provider,
        j.billing_type ?? '',
        j.portfolio_name ?? '',
        j.batch_name ?? '',
        j.start_date ?? '',
        j.end_date ?? '',
        j.failed_reason ?? '',
        username,
        password,
      ]
        .map(escape)
        .join(',');
    });

    return [header, ...rows].join('\r\n');
  }
}
