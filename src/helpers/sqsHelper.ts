import { SQSClient, SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import { Logger } from '@nestjs/common';

const logger = new Logger('SQSHelper');

// Initialize AWS SQS client with credentials (using S3 credentials)
const sqsClient = new SQSClient({
  region: process.env.S3_REGION || 'us-east-1',
  credentials:
    process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY
      ? {
          accessKeyId: process.env.S3_ACCESS_KEY,
          secretAccessKey: process.env.S3_SECRET_KEY,
        }
      : undefined, // Will use default credential provider chain if not specified
});

/**
 * Push jobs to AWS SQS queue in batches of 10
 * @param jobs - Array of job objects to push to the queue
 */
export async function pushJobsToQueue(jobs: any[]): Promise<void> {
  try {
    // Get the SQS queue URL from environment variables
    const queueUrl = process.env.QUEUE_URL;

    // Validate that QUEUE_URL is configured
    if (!queueUrl) {
      logger.warn('QUEUE_URL not configured. Skipping SQS push.');
      return;
    }

    // Exit early if no jobs to process
    if (!jobs || jobs.length === 0) {
      logger.log('No jobs to push to SQS queue.');
      return;
    }

    logger.log(`Preparing to push ${jobs.length} job(s) to SQS queue...`);

    // Process jobs in batches of 10 (AWS SQS limit for SendMessageBatch)
    const batchSize = 10;
    let totalPushed = 0;

    for (let i = 0; i < jobs.length; i += batchSize) {
      // Get the current batch of jobs
      const batch = jobs.slice(i, i + batchSize);

      // Prepare message entries for the batch
      const entries = batch.map((job, index) => ({
        Id: `msg-${i + index}`, // Unique ID for each message in the batch
        MessageBody: JSON.stringify({
          body: {
            startDate: job.start_date,
            endDate: job.end_date,
            jobId: job.id || job._id, // Support both id and _id fields
          },
          header: {
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            timeout: 300000, // 5 minute timeout
          },
        }),
        MessageGroupId: `job-${job.id || job._id}`, // Unique per job for FIFO queues
        MessageDeduplicationId: `${job.id || job._id}-${Date.now()}-${index}`, // Unique deduplication ID
      }));

      // Send the batch to SQS
      const command = new SendMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: entries,
      });

      const response = await sqsClient.send(command);

      // Log successful and failed messages
      const successCount = response.Successful?.length || 0;
      const failedCount = response.Failed?.length || 0;

      totalPushed += successCount;

      if (successCount > 0) {
        logger.log(
          `Successfully pushed ${successCount} job(s) to SQS (batch ${Math.floor(i / batchSize) + 1})`,
        );
      }

      if (failedCount > 0) {
        logger.error(
          `Failed to push ${failedCount} job(s) to SQS (batch ${Math.floor(i / batchSize) + 1})`,
        );
        response.Failed?.forEach((failure) => {
          logger.error(`Message ID ${failure.Id} failed: ${failure.Message}`);
        });
      }
    }

    logger.log(
      `Completed SQS push: ${totalPushed}/${jobs.length} job(s) successfully pushed to queue.`,
    );
  } catch (error) {
    logger.error(
      `Error pushing jobs to SQS queue: ${error.message}`,
      error.stack,
    );
    // Don't throw error to prevent disrupting the main job creation flow
  }
}
