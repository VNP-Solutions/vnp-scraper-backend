import {
  DeleteMessageCommand,
  Message,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { Logger } from '@nestjs/common';

/**
 * Async bulk job-items import pipeline — SQS plumbing.
 *
 * The controller receives the uploaded file, pushes it to S3, and
 * enqueues a small message pointing at the S3 object. This worker then
 * downloads the file, parses it, groups rows by resolved job, and
 * reuses the existing single-job upload logic for each group.
 *
 * Required env:
 *   BULK_JOB_ITEMS_IMPORT_QUEUE_URL — full URL of a standard SQS queue.
 *   If missing, the controller falls back to a synchronous (in-request)
 *   path with a warning log.
 *
 * Reuses the same AWS credentials as the rest of the app:
 *   S3_REGION / S3_ACCESS_KEY / S3_SECRET_KEY.
 */

export interface BulkJobItemsImportMessage {
  /** S3 key where the uploaded file is stored. */
  s3Key: string;
  /** Original filename from the user. */
  originalName: string;
  /** User who triggered the import. */
  user: {
    userId: string;
    email: string;
    name?: string | null;
  };
  /** ISO timestamp recorded when the controller enqueued the message. */
  requestedAt: string;
}

let _sqsClient: SQSClient | null = null;
export function getBulkJobItemsImportSqsClient(): SQSClient {
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

export function getBulkJobItemsImportQueueUrl(): string | null {
  const url = process.env.BULK_JOB_ITEMS_IMPORT_QUEUE_URL;
  return url && url.trim().length > 0 ? url : null;
}

export async function enqueueBulkJobItemsImport(
  payload: BulkJobItemsImportMessage,
  logger: Logger = new Logger('BulkJobItemsImportSqs'),
): Promise<string> {
  const queueUrl = getBulkJobItemsImportQueueUrl();
  if (!queueUrl) {
    throw new Error(
      'BULK_JOB_ITEMS_IMPORT_QUEUE_URL is not configured — cannot enqueue import.',
    );
  }

  const client = getBulkJobItemsImportSqsClient();
  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(payload),
  });

  const res = await client.send(command);
  logger.log(
    `Enqueued bulk job-items import for ${payload.user.email} ` +
      `(file="${payload.originalName}", MessageId=${res.MessageId})`,
  );
  return res.MessageId ?? '';
}

export async function deleteBulkJobItemsImportMessage(
  receiptHandle: string,
  logger: Logger = new Logger('BulkJobItemsImportSqs'),
): Promise<void> {
  const queueUrl = getBulkJobItemsImportQueueUrl();
  if (!queueUrl) return;
  try {
    await getBulkJobItemsImportSqsClient().send(
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

export async function receiveBulkJobItemsImportMessage(): Promise<Message | null> {
  const queueUrl = getBulkJobItemsImportQueueUrl();
  if (!queueUrl) return null;

  const res = await getBulkJobItemsImportSqsClient().send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 20,
      MessageAttributeNames: ['All'],
    }),
  );

  return res.Messages && res.Messages.length > 0 ? res.Messages[0] : null;
}
