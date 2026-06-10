import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { MailService } from '../../common/utils/mail.service';
import { ReportsResultItem, IReportsService } from './reports.interface';

/** Default: every day at 12:00 noon (server local time). */
const DEFAULT_CRON_TIME = '0 0 12 * * *';

/** Statuses included in the daily CSV attachment. */
const ATTACHMENT_STATUSES = ['Failed', 'NothingToReport'];

/** CSV columns included in the daily attachment. */
const CSV_HEADERS = [
  'Job ID',
  'Job Status',
  'Property ID',
  'Property Name',
  'Expedia ID',
  'Booking ID',
  'Agoda ID',
  'OTA Provider',
  'Billing Type',
  'Execution Type',
  'Portfolio',
  'Sub Portfolio',
  'Batch',
  'Start Date',
  'End Date',
  'Failed Reason',
  'Updated At',
];

@Injectable()
export class ReportsSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ReportsSchedulerService.name);

  constructor(
    @Inject('IReportsService')
    private readonly reportsService: IReportsService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
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
      // Fetch statistics and failed jobs concurrently.
      const [stats, failedResult] = await Promise.all([
        this.reportsService.getStatistics(baseBody as any, systemUser),
        this.reportsService.searchReports(
          { ...baseBody, job_statuses: ATTACHMENT_STATUSES, page: 1, limit: 10000 } as any,
          systemUser,
        ),
      ]);

      const failedJobs: ReportsResultItem[] = failedResult.data ?? [];
      const csvAttachment =
        failedJobs.length > 0
          ? {
              filename: `failed-nothing-to-report-jobs-${dateStr}.csv`,
              content: this.buildCsv(failedJobs),
            }
          : null;

      await this.mailService.sendDailyStatisticsEmail({
        to: recipients,
        stats,
        date: dateStr,
        failedJobsCsv: csvAttachment,
      });

      this.logger.log(
        `Daily statistics email sent for ${dateStr}. Failed jobs attached: ${failedJobs.length}.`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send daily statistics email for ${dateStr}: ${error?.message}`,
        error?.stack,
      );
    }
  }

  // ---------------------------------------------------------------------------

  private buildCsv(jobs: ReportsResultItem[]): string {
    const escape = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      // Wrap in quotes if the value contains a comma, quote, or newline.
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const header = CSV_HEADERS.join(',');
    const rows = jobs.map((j) =>
      [
        j.id,
        j.job_status,
        j.property_id ?? '',
        j.property_name,
        j.property?.expedia_id ?? '',
        j.property?.booking_id ?? '',
        j.property?.agoda_id ?? '',
        j.ota_provider,
        j.billing_type ?? '',
        j.execution_type ?? '',
        j.portfolio_name ?? '',
        j.sub_portfolio_name ?? '',
        j.batch_name ?? '',
        j.start_date ?? '',
        j.end_date ?? '',
        j.failed_reason ?? '',
        j.updatedAt ? new Date(j.updatedAt).toISOString() : '',
      ]
        .map(escape)
        .join(','),
    );

    return [header, ...rows].join('\r\n');
  }
}
