import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { OtaPostPreChargingStatus } from '@prisma/client';
import { MailService } from '../../common/utils/mail.service';
import { S3UploadService } from '../../common/utils/s3-upload.util';
import { streamOtaPostPreChargingConversion } from './ota-post-pre-charging-export-stream.util';
import { OtaPostPreChargingRepository } from './ota-post-pre-charging.repository';
import {
  deleteOtaPostPreChargingMessage,
  getOtaPostPreChargingQueueUrl,
  OtaPostPreChargingExportMessage,
  receiveOtaPostPreChargingMessage,
} from './ota-post-pre-charging-sqs.util';

@Injectable()
export class OtaPostPreChargingExportConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OtaPostPreChargingExportConsumer.name);
  private isShuttingDown = false;
  private currentTask: Promise<void> | null = null;

  constructor(
    private readonly repository: OtaPostPreChargingRepository,
    private readonly s3Upload: S3UploadService,
    private readonly mail: MailService,
  ) {}

  onApplicationBootstrap(): void {
    if (!getOtaPostPreChargingQueueUrl()) {
      this.logger.warn(
        'OTA_POST_PRE_CHARGING_QUEUE_URL not configured — async conversion consumer ' +
          'will NOT start. Large conversions will fall back to in-request processing.',
      );
      return;
    }

    this.logger.log(
      'OTA post pre-charging export consumer started — long-polling queue ' +
        '(20s wait, one in-flight message at a time).',
    );
    void this.runLoop();
  }

  async onApplicationShutdown(): Promise<void> {
    this.isShuttingDown = true;
    if (this.currentTask) {
      this.logger.log(
        'Shutdown received — waiting for in-flight conversion to finish…',
      );
      try {
        await this.currentTask;
      } catch {
        // already logged inside handleMessage
      }
    }
    this.logger.log('OTA post pre-charging export consumer stopped.');
  }

  private async runLoop(): Promise<void> {
    while (!this.isShuttingDown) {
      try {
        const message = await receiveOtaPostPreChargingMessage();
        if (!message) continue;

        this.currentTask = this.handleMessage(message).catch((error) => {
          this.logger.error(
            `Unhandled error in OTA post pre-charging consumer: ${error?.message ?? error}`,
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

    let payload: OtaPostPreChargingExportMessage;
    try {
      payload = JSON.parse(message.Body ?? '') as OtaPostPreChargingExportMessage;
    } catch (error: any) {
      this.logger.error(
        `Message ${messageId} body is not valid JSON: ${error?.message ?? error}`,
      );
      await deleteOtaPostPreChargingMessage(receiptHandle, this.logger);
      return;
    }

    if (
      !payload?.recordId ||
      !payload?.originalFileUrl ||
      !payload?.user?.email
    ) {
      this.logger.error(
        `Message ${messageId} payload is missing required fields — deleting.`,
      );
      await deleteOtaPostPreChargingMessage(receiptHandle, this.logger);
      return;
    }

    const startedAt = Date.now();
    this.logger.log(
      `Processing OTA post pre-charging export for ${payload.user.email} ` +
        `(record=${payload.recordId}, MessageId=${messageId})`,
    );

    try {
      const key = this.s3Upload.extractKeyFromUrl(payload.originalFileUrl);
      const inputStream = await this.s3Upload.getObjectStream(key);
      const placeholderFileName = `ota-post-pre-charging-${Date.now()}.xlsx`;
      const s3Key = `ota-post-pre-charging/${payload.user.userId}/${placeholderFileName}`;
      let fileName = placeholderFileName;
      let rowCount = 0;

      const { url, expiresAt } = await this.s3Upload.uploadStreamAndPresign(
        s3Key,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        async (writable) => {
          const result = await streamOtaPostPreChargingConversion(
            inputStream,
            payload.originalFileName,
            undefined,
            writable,
          );
          fileName = result.fileName;
          rowCount = result.rowCount;
        },
      );

      const bucketUrl = process.env.S3_BUCKET_URL?.replace(/\/+$/, '') ?? '';
      const permanentUrl = `${bucketUrl}/${s3Key}`;

      await this.repository.update(payload.recordId, {
        converted_file_url: permanentUrl,
        row_count: rowCount,
        status: OtaPostPreChargingStatus.Completed,
        error_message: null,
      });

      await this.mail.sendReportReadyEmail({
        to: payload.user.email,
        userName: payload.user.name ?? null,
        exportLabel: 'OTA Post Pre-Charging',
        jobCount: rowCount,
        downloadUrl: url,
        downloadFileName: fileName,
        expiresAt,
      });

      await deleteOtaPostPreChargingMessage(receiptHandle, this.logger);

      this.logger.log(
        `Finished OTA post pre-charging export for ${payload.user.email} in ` +
          `${Date.now() - startedAt}ms (record=${payload.recordId})`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed OTA post pre-charging export for ${payload.user.email}: ` +
          `${error?.message ?? error}`,
        error?.stack,
      );

      await this.repository.update(payload.recordId, {
        status: OtaPostPreChargingStatus.Failed,
        error_message: error?.message ?? 'Conversion failed',
      });

      try {
        const record = await this.repository.findById(payload.recordId);
        await this.mail.sendReportFailedEmail({
          to: payload.user.email,
          userName: payload.user.name ?? null,
          exportLabel: 'OTA Post Pre-Charging',
          jobCount: record?.row_count ?? 0,
          reason: error?.message ?? 'Unknown error while converting the file.',
        });
      } catch (mailError: any) {
        this.logger.error(
          `Also failed to send conversion failure email: ${mailError?.message ?? mailError}`,
        );
      }
    }
  }
}
