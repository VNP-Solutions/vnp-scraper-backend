import {
  DeleteMessageCommand,
  Message,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { Logger } from '@nestjs/common';

export interface OtaPostPreChargingExportMessage {
  recordId: string;
  originalFileUrl: string;
  originalFileName: string;
  user: {
    userId: string;
    email: string;
    name?: string | null;
  };
  requestedAt: string;
}

let _sqsClient: SQSClient | null = null;

export function getOtaPostPreChargingSqsClient(): SQSClient {
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

export function getOtaPostPreChargingQueueUrl(): string | null {
  const url = process.env.OTA_POST_PRE_CHARGING_QUEUE_URL;
  return url && url.trim().length > 0 ? url : null;
}

export async function enqueueOtaPostPreChargingExport(
  payload: OtaPostPreChargingExportMessage,
  logger: Logger = new Logger('OtaPostPreChargingSqs'),
): Promise<string> {
  const queueUrl = getOtaPostPreChargingQueueUrl();
  if (!queueUrl) {
    throw new Error(
      'OTA_POST_PRE_CHARGING_QUEUE_URL is not configured — cannot enqueue export.',
    );
  }

  const client = getOtaPostPreChargingSqsClient();
  const response = await client.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(payload),
    }),
  );

  logger.log(
    `Enqueued OTA post pre-charging export for ${payload.user.email} ` +
      `(record=${payload.recordId}, MessageId=${response.MessageId})`,
  );

  return response.MessageId ?? '';
}

export async function deleteOtaPostPreChargingMessage(
  receiptHandle: string,
  logger: Logger = new Logger('OtaPostPreChargingSqs'),
): Promise<void> {
  const queueUrl = getOtaPostPreChargingQueueUrl();
  if (!queueUrl) return;

  try {
    await getOtaPostPreChargingSqsClient().send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  } catch (error: any) {
    logger.error(
      `Failed to delete SQS message: ${error?.message ?? error}`,
      error?.stack,
    );
  }
}

export async function receiveOtaPostPreChargingMessage(): Promise<Message | null> {
  const queueUrl = getOtaPostPreChargingQueueUrl();
  if (!queueUrl) return null;

  const response = await getOtaPostPreChargingSqsClient().send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 20,
      MessageAttributeNames: ['All'],
    }),
  );

  return response.Messages && response.Messages.length > 0
    ? response.Messages[0]
    : null;
}
