import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { S3UploadService } from '../../common/utils/s3-upload.util';
import { MailService } from '../../common/utils/mail.service';
import { IScraperJobItemService } from './scraper-job-item.interface';
import {
  BulkJobItemsImportMessage,
  deleteBulkJobItemsImportMessage,
  getBulkJobItemsImportQueueUrl,
  receiveBulkJobItemsImportMessage,
} from './bulk-job-items-import-sqs.util';

/**
 * Long-poll worker for the bulk job-items import SQS queue.
 *
 * Lifecycle mirrors the other async consumers in the codebase:
 * - Boots automatically when Nest starts.
 * - Stops gracefully on shutdown, waiting for the in-flight message.
 * - If BULK_JOB_ITEMS_IMPORT_QUEUE_URL is not set, the consumer stays
 *   idle and the controller falls back to synchronous processing.
 */
@Injectable()
export class BulkJobItemsImportConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(BulkJobItemsImportConsumer.name);
  private isShuttingDown = false;
  private currentTask: Promise<void> | null = null;

  constructor(
    @Inject('IScraperJobItemService')
    private readonly jobItemService: IScraperJobItemService,
    private readonly s3Upload: S3UploadService,
    private readonly mail: MailService,
  ) {}

  onApplicationBootstrap(): void {
    if (!getBulkJobItemsImportQueueUrl()) {
      this.logger.warn(
        'BULK_JOB_ITEMS_IMPORT_QUEUE_URL not configured — async bulk job-items import consumer ' +
          'will NOT start. Imports will be processed synchronously.',
      );
      return;
    }

    this.logger.log(
      'Bulk job-items import consumer started — long-polling queue ' +
        '(20s wait, one in-flight message at a time).',
    );
    void this.runLoop();
  }

  async onApplicationShutdown(): Promise<void> {
    this.isShuttingDown = true;
    if (this.currentTask) {
      this.logger.log(
        'Shutdown received — waiting for in-flight bulk import to finish…',
      );
      try {
        await this.currentTask;
      } catch {
        // already logged inside handleMessage
      }
    }
    this.logger.log('Bulk job-items import consumer stopped.');
  }

  private async runLoop(): Promise<void> {
    while (!this.isShuttingDown) {
      try {
        const message = await receiveBulkJobItemsImportMessage();
        if (!message) continue;

        this.currentTask = this.handleMessage(message).catch((error) => {
          this.logger.error(
            `Unhandled error in bulk job-items import consumer: ${
              error?.message ?? error
            }`,
            error?.stack,
          );
        });
        await this.currentTask;
        this.currentTask = null;
      } catch (error: any) {
        this.logger.error(
          `Polling error (will retry after 5s): ${error?.message ?? error}`,
          error?.stack,
        );
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

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

    let payload: BulkJobItemsImportMessage;
    try {
      payload = JSON.parse(message.Body ?? '') as BulkJobItemsImportMessage;
    } catch (error: any) {
      this.logger.error(
        `Message ${messageId} body is not valid JSON: ${
          error?.message ?? error
        }`,
      );
      await deleteBulkJobItemsImportMessage(receiptHandle, this.logger);
      return;
    }

    if (!payload?.s3Key || !payload?.user?.email) {
      this.logger.error(
        `Message ${messageId} payload is missing required fields — deleting.`,
      );
      await deleteBulkJobItemsImportMessage(receiptHandle, this.logger);
      return;
    }

    this.logger.log(
      `Starting bulk job-items import message — file="${payload.originalName}" ` +
        `s3Key=${payload.s3Key} user=${payload.user.email} messageId=${messageId}`,
    );

    let report: {
      status: 'success' | 'partial' | 'failed';
      totalRows: number;
      processedJobs: number;
      created: number;
      updated: number;
      errors: Array<{ row: number; message: string }>;
    } | null = null;

    try {
      const fileBuffer = await this.s3Upload.downloadBuffer(payload.s3Key);
      this.logger.log(
        `Downloaded import file from S3 — ${fileBuffer.length} bytes`,
      );
      const fakeFile: Express.Multer.File = {
        buffer: fileBuffer,
        originalname: payload.originalName,
        mimetype: this.inferMimetype(payload.originalName),
        size: fileBuffer.length,
        fieldname: 'file',
        encoding: '7bit',
      } as Express.Multer.File;

      report = await this.jobItemService.bulkUploadJobItemsFromFile(fakeFile);

      await this.mail.sendBulkJobItemsImportReportEmail({
        to: payload.user.email,
        userName: payload.user.name,
        status: report.status,
        fileName: payload.originalName,
        totalRows: report.totalRows,
        processedJobs: report.processedJobs,
        created: report.created,
        updated: report.updated,
        errors: report.errors,
      });

      this.logger.log(
        `Bulk job-items import completed — file="${payload.originalName}", status=${report.status}, ` +
          `${report.created} created, ${report.updated} updated across ${report.processedJobs} job(s), ` +
          `${report.errors.length} error(s)`,
      );
    } catch (error: any) {
      this.logger.error(
        `Bulk job-items import failed: ${error?.message ?? error}`,
        error?.stack,
      );
      await this.mail.sendBulkJobItemsImportReportEmail({
        to: payload.user.email,
        userName: payload.user.name,
        status: 'failed',
        fileName: payload.originalName,
        totalRows: report?.totalRows ?? 0,
        processedJobs: report?.processedJobs ?? 0,
        created: report?.created ?? 0,
        updated: report?.updated ?? 0,
        errors: report?.errors ?? [],
        failureReason: error?.message ?? 'Unknown error',
      });
    } finally {
      await deleteBulkJobItemsImportMessage(receiptHandle, this.logger);
    }
  }

  private inferMimetype(originalName: string): string {
    const lower = originalName.toLowerCase();
    if (lower.endsWith('.csv')) return 'text/csv';
    if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
}
