import {
  DeleteMessageCommand,
  Message,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { Logger } from '@nestjs/common';

/**
 * Async report-export pipeline — SQS plumbing.
 *
 * - One STANDARD SQS queue (separate from the existing FIFO `QUEUE_URL`
 *   used by the scraper module).
 * - Producer (`enqueueReportExport`) is called by the Reports controller
 *   when an incoming `/reports/export-*` request has more than 10
 *   `job_ids` — the controller responds 202 immediately and the message
 *   is consumed in-process by `ReportsExportConsumer`.
 *
 * Required env:
 *   REPORTS_EXPORT_QUEUE_URL — full URL of the standard queue created in
 *                              AWS. If missing, the controller falls back
 *                              to the synchronous path (with a warning
 *                              log) so dev environments still work.
 *
 * Reuses the same IAM credentials as the existing scraper queue:
 *   S3_REGION / S3_ACCESS_KEY / S3_SECRET_KEY.
 */

/**
 * Discriminator for queued job types.
 *   - 'master' | 'consolidated' | 'dashboard' — file export to S3 + email
 *   - 'bulk_archive' — background DB archive/unarchive, no S3, no email
 */
export type ReportExportType =
  | 'master'
  | 'consolidated'
  | 'dashboard'
  | 'bulk_archive';

/**
 * Payload shape stored in the SQS message body. Keep this small — SQS
 * caps message size at 256 KB, and 10k ObjectIds is already ~280 KB, so
 * keep an eye on it if you ever push more than 8k jobs in one export.
 * (For now the controller validates job_ids.min(1), no upper cap.)
 */
export interface ReportExportMessage {
  /** Which builder / operation to run. */
  exportType: ReportExportType;
  /** Job IDs to process. Already deduped on producer side. */
  jobIds: string[];
  /**
   * User who triggered the operation.
   * `email` is required for export types (needed to send the download link).
   * For `bulk_archive` only `userId` is used (no email is sent).
   */
  user: {
    userId: string;
    email: string;
    name?: string | null;
  };
  /** ISO timestamp recorded when the controller enqueued the message. */
  requestedAt: string;
  /**
   * Only present for `exportType === 'bulk_archive'`.
   * true  → archive the jobs
   * false → unarchive the jobs
   */
  archiveStatus?: boolean;
}

/**
 * Build an SQS client with the same credentials the rest of the app
 * uses for AWS access. Shared between producer + consumer so we only
 * pay the connection setup once per process.
 */
let _sqsClient: SQSClient | null = null;
export function getReportsSqsClient(): SQSClient {
  if (_sqsClient) return _sqsClient;
  _sqsClient = new SQSClient({
    region: process.env.S3_REGION || 'us-east-1',
    credentials:
      process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY
        ? {
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_KEY,
          }
        : undefined,
  });
  return _sqsClient;
}

/**
 * Returns the configured queue URL or `null` when the env var is
 * missing (dev environments). Callers should treat `null` as "async
 * pipeline disabled → fall back to sync".
 */
export function getReportsExportQueueUrl(): string | null {
  const url = process.env.REPORTS_EXPORT_QUEUE_URL;
  return url && url.trim().length > 0 ? url : null;
}

/**
 * Push a single `ReportExportMessage` onto the reports-export queue.
 * Returns the SQS message ID for logging / debugging.
 *
 * Throws if the queue URL isn't configured — the controller checks that
 * separately and short-circuits to the sync path before reaching here.
 */
export async function enqueueReportExport(
  payload: ReportExportMessage,
  logger: Logger = new Logger('ReportsSqs'),
): Promise<string> {
  const queueUrl = getReportsExportQueueUrl();
  if (!queueUrl) {
    throw new Error(
      'REPORTS_EXPORT_QUEUE_URL is not configured — cannot enqueue export.',
    );
  }

  const client = getReportsSqsClient();
  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(payload),
    // Standard queue — no group / dedup IDs. (If the queue is ever
    // recreated as FIFO, add MessageGroupId + MessageDeduplicationId
    // here.)
  });

  const res = await client.send(command);
  logger.log(
    `Enqueued ${payload.exportType} export for user ${payload.user.email} ` +
      `(${payload.jobIds.length} jobs, MessageId=${res.MessageId})`,
  );
  return res.MessageId ?? '';
}

/**
 * Helper used by the consumer to acknowledge successful processing.
 * Failure path simply skips this call — SQS will redeliver after the
 * queue's visibility timeout, eventually moving the message to the DLQ
 * after the configured max-receive-count.
 */
export async function deleteReportExportMessage(
  receiptHandle: string,
  logger: Logger = new Logger('ReportsSqs'),
): Promise<void> {
  const queueUrl = getReportsExportQueueUrl();
  if (!queueUrl) return;
  try {
    await getReportsSqsClient().send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  } catch (err) {
    logger.error(
      `Failed to delete SQS message: ${err?.message ?? err}`,
      err?.stack,
    );
  }
}

/**
 * One round of long-polling. Returns up to one message (consumer
 * intentionally processes one at a time per Node process — see
 * `ReportsExportConsumer`).
 */
export async function receiveReportExportMessage(): Promise<Message | null> {
  const queueUrl = getReportsExportQueueUrl();
  if (!queueUrl) return null;

  const res = await getReportsSqsClient().send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 1,
      // 20s long-poll matches the AWS-recommended setting from the queue
      // config — keeps idle cost near zero.
      WaitTimeSeconds: 20,
      // We don't currently use message attributes, but request them so
      // future producers (e.g. retry-with-context) can add metadata
      // without us having to redeploy the consumer.
      MessageAttributeNames: ['All'],
    }),
  );

  return res.Messages && res.Messages.length > 0 ? res.Messages[0] : null;
}
