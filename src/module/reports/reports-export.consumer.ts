import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { MailService } from '../../common/utils/mail.service';
import { S3UploadService } from '../../common/utils/s3-upload.util';
import { IJobService } from '../job/job.interface';
import {
  ReportExportMessage,
  ReportExportType,
  deleteReportExportMessage,
  getReportsExportQueueUrl,
  receiveReportExportMessage,
} from './reports-sqs.util';

/**
 * Long-poll worker for the reports-export SQS queue.
 *
 * Lifecycle:
 * - `onApplicationBootstrap` kicks off the poll loop the moment Nest is
 *   ready to handle traffic. We don't `await` it (it runs for the life
 *   of the process); Nest just sees a resolved promise and continues.
 * - `onApplicationShutdown` flips an "are we stopping?" flag. The loop
 *   exits after the in-flight message (if any) finishes processing —
 *   SQS visibility timeout protects us if the process is killed
 *   mid-job (the message is redelivered automatically).
 *
 * Concurrency:
 * - One message at a time per Node process. The export builders load
 *   tens of MB into memory; concurrent builds inside the same process
 *   would multiply that. If you run multiple Node workers (e.g. PM2
 *   cluster mode, ECS replicas), each of them long-polls independently
 *   and you get natural fan-out across processes.
 */
@Injectable()
export class ReportsExportConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ReportsExportConsumer.name);
  private isShuttingDown = false;
  /** Promise representing the currently in-flight message handler. */
  private currentTask: Promise<void> | null = null;

  constructor(
    @Inject('IJobService') private readonly jobService: IJobService,
    private readonly s3Upload: S3UploadService,
    private readonly mail: MailService,
  ) {}

  onApplicationBootstrap(): void {
    if (!getReportsExportQueueUrl()) {
      this.logger.warn(
        'REPORTS_EXPORT_QUEUE_URL not configured — async export consumer ' +
          'will NOT start. The /reports/export-* endpoints will fall back ' +
          'to synchronous responses regardless of job count.',
      );
      return;
    }
    this.logger.log(
      'Async export consumer started — long-polling reports-export queue ' +
        '(20s wait, one in-flight message at a time).',
    );
    // Fire-and-forget — runs until shutdown.
    void this.runLoop();
  }

  async onApplicationShutdown(): Promise<void> {
    this.isShuttingDown = true;
    if (this.currentTask) {
      this.logger.log(
        'Shutdown received — waiting for in-flight export to finish…',
      );
      try {
        await this.currentTask;
      } catch {
        // already logged inside handleMessage
      }
    }
    this.logger.log('Async export consumer stopped.');
  }

  /**
   * Long-poll → process → repeat. Errors at the polling boundary are
   * logged and the loop continues after a brief backoff so a transient
   * SQS / network glitch doesn't kill the worker.
   */
  private async runLoop(): Promise<void> {
    while (!this.isShuttingDown) {
      try {
        const message = await receiveReportExportMessage();
        if (!message) continue; // long-poll timed out → loop again

        this.currentTask = this.handleMessage(message).catch((err) => {
          this.logger.error(
            `Unhandled error in export consumer: ${err?.message ?? err}`,
            err?.stack,
          );
        });
        await this.currentTask;
        this.currentTask = null;
      } catch (err) {
        this.logger.error(
          `Polling error (will retry after 5s): ${err?.message ?? err}`,
          err?.stack,
        );
        // Small backoff so a misconfigured queue / IAM error doesn't
        // hot-loop. SQS rate limits would otherwise kick in anyway.
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  /**
   * Process exactly one SQS message:
   *   1. Parse + validate the body
   *   2. Build the file via the matching JobService method
   *   3. Upload to S3 and generate a 7-day presigned URL
   *   4. Email the user with the link
   *   5. Delete the SQS message
   *
   * On any failure: send a "failed" email and DO NOT delete the
   * message. SQS visibility timeout will redeliver it; after the
   * queue's `maxReceiveCount` attempts, it lands in the DLQ for
   * manual investigation.
   */
  private async handleMessage(
    message: import('@aws-sdk/client-sqs').Message,
  ): Promise<void> {
    const receiptHandle = message.ReceiptHandle;
    const messageId = message.MessageId;
    if (!receiptHandle) {
      this.logger.error(
        `Message ${messageId} has no ReceiptHandle — cannot ack/delete; skipping.`,
      );
      return;
    }

    let payload: ReportExportMessage;
    try {
      payload = JSON.parse(message.Body ?? '') as ReportExportMessage;
    } catch (err) {
      this.logger.error(
        `Message ${messageId} body is not valid JSON: ${err?.message ?? err} ` +
          `— deleting from queue (cannot retry).`,
      );
      // Bad body will fail every retry — drop it so it doesn't loop to DLQ.
      await deleteReportExportMessage(receiptHandle, this.logger);
      return;
    }

    if (
      !payload ||
      !payload.exportType ||
      !Array.isArray(payload.jobIds) ||
      !payload.user?.email
    ) {
      this.logger.error(
        `Message ${messageId} payload is missing required fields — deleting.`,
      );
      await deleteReportExportMessage(receiptHandle, this.logger);
      return;
    }

    const startedAt = Date.now();
    const label = this.labelFor(payload.exportType);
    this.logger.log(
      `Processing ${label} export for ${payload.user.email} ` +
        `(${payload.jobIds.length} jobs, MessageId=${messageId})`,
    );

    try {
      // 1. Build + upload in ONE streaming pipeline.
      //    The JobService streamXxx methods write XLSX/ZIP bytes into
      //    the PassThrough that lib-storage's `Upload` is consuming on
      //    the other side — memory stays bounded regardless of how many
      //    jobs are in the export.
      //
      //    Filename has to be decided after we crack open the export
      //    because it embeds a timestamp generated inside the stream
      //    method. We compute the S3 key with a placeholder, then pull
      //    the final fileName off the streamXxx return value to email
      //    the user. The S3 key separately uses a stable ISO timestamp
      //    prefix so listing the bucket is chronological.
      const placeholderFileName = this.placeholderFilenameFor(
        payload.exportType,
      );
      const key = this.buildS3Key(payload, placeholderFileName);
      const contentType = this.contentTypeFor(
        payload.exportType,
        placeholderFileName,
      );

      let fileName = placeholderFileName;
      const { url, expiresAt } = await this.s3Upload.uploadStreamAndPresign(
        key,
        contentType,
        async (writable) => {
          const result = await this.streamExport(payload, writable);
          fileName = result.fileName;
        },
      );

      // 2. Email the user the download link.
      this.logger.log(
        `[Consumer] Sending download-link email to ${payload.user.email} ` +
          `(file=${fileName}, expires=${expiresAt.toISOString()})`,
      );
      await this.mail.sendReportReadyEmail({
        to: payload.user.email,
        userName: payload.user.name ?? null,
        exportLabel: label,
        jobCount: payload.jobIds.length,
        downloadUrl: url,
        downloadFileName: fileName,
        expiresAt,
      });
      this.logger.log(
        `[Consumer] Email sent to ${payload.user.email}`,
      );

      // 4. Ack the SQS message only after the email is on its way —
      //    if email send throws, the message stays in the queue and
      //    the user gets a retry (and eventually a failure email after
      //    maxReceiveCount).
      await deleteReportExportMessage(receiptHandle, this.logger);

      this.logger.log(
        `Finished ${label} export for ${payload.user.email} in ` +
          `${Date.now() - startedAt}ms (s3://…/${key})`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to build/deliver ${label} export for ${payload.user.email}: ` +
          `${err?.message ?? err}`,
        err?.stack,
      );
      // Best-effort failure notification — wrap in its own try so a
      // mail outage doesn't mask the root cause in the logs.
      try {
        await this.mail.sendReportFailedEmail({
          to: payload.user.email,
          userName: payload.user.name ?? null,
          exportLabel: label,
          jobCount: payload.jobIds.length,
          reason:
            (err?.message as string) ??
            'Unknown error while generating the report.',
        });
      } catch (mailErr) {
        this.logger.error(
          `Also failed to send "report failed" email: ` +
            `${mailErr?.message ?? mailErr}`,
        );
      }
      // DO NOT delete the message — let SQS redeliver. After
      // maxReceiveCount the queue's redrive policy forwards it to the
      // DLQ for manual investigation.
    }
  }

  /**
   * Streaming dispatch: route to the right JobService stream method
   * based on the export type. The method writes bytes into `writable`
   * (a PassThrough hooked up to S3's multipart `Upload`) and returns
   * the suggested file name.
   */
  private async streamExport(
    payload: ReportExportMessage,
    writable: import('stream').Writable,
  ): Promise<{ fileName: string }> {
    switch (payload.exportType) {
      case 'master':
        return this.jobService.streamMasterXlsxZip(payload.jobIds, writable);
      case 'consolidated':
        return this.jobService.streamConsolidatedMasterXlsx(
          payload.jobIds,
          writable,
        );
      case 'dashboard':
        return this.jobService.streamDashboardXlsx(payload.jobIds, writable);
      default:
        throw new Error(`Unknown exportType: ${payload.exportType}`);
    }
  }

  /**
   * S3 key needs to be generated BEFORE we open the export stream
   * (lib-storage's `Upload` needs the key up-front). We use a stable
   * placeholder filename for the key (extension is the only part S3
   * actually cares about — the real human-readable filename gets
   * embedded in the email instead).
   */
  private placeholderFilenameFor(t: ReportExportType): string {
    const ts = Date.now();
    switch (t) {
      case 'master':
        return `reports-export-${ts}.zip`;
      case 'consolidated':
        return `consolidated-report-${ts}.xlsx`;
      case 'dashboard':
        return `dashboard-report-${ts}.xlsx`;
    }
  }

  private labelFor(t: ReportExportType): string {
    switch (t) {
      case 'master':
        return 'Master ZIP';
      case 'consolidated':
        return 'Consolidated Report';
      case 'dashboard':
        return 'Dashboard Report';
    }
  }

  private contentTypeFor(t: ReportExportType, fileName: string): string {
    if (t === 'master' || fileName.endsWith('.zip')) return 'application/zip';
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }

  /**
   * Build a stable, human-readable S3 key. One folder per user keeps
   * `aws s3 ls` reasonable, and the ISO timestamp prefix means the
   * default listing order is chronological.
   */
  private buildS3Key(payload: ReportExportMessage, fileName: string): string {
    const isoTs = new Date().toISOString().replace(/[:.]/g, '-');
    return `reports/exports/${payload.user.userId}/${isoTs}-${fileName}`;
  }
}
