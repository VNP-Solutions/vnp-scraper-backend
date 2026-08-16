import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { Logger } from '@nestjs/common';

const logger = new Logger('LambdaHelper');

// Initialize AWS Lambda client with credentials (using S3 credentials)
const lambdaClient = new LambdaClient({
  region: process.env.S3_REGION || 'us-east-1',
  credentials: process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY
    ? {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY,
      }
    : undefined, // Will use default credential provider chain if not specified
});

/**
 * Trigger AWS Lambda function asynchronously
 * @param platform - The platform to send as payload to Lambda
 */
export async function triggerLambda(platform: string): Promise<void> {
  try {
    // Get the Lambda function name from environment variables
    const functionName = process.env.LAMBDA_FUNCTION_NAME;

    // Validate that LAMBDA_FUNCTION_NAME is configured
    if (!functionName) {
      logger.warn('LAMBDA_FUNCTION_NAME not configured. Skipping Lambda trigger.');
      return;
    }

    // Validate platform parameter
    if (!platform) {
      logger.warn('Platform not provided. Skipping Lambda trigger.');
      return;
    }

    logger.log(`Triggering Lambda function "${functionName}" for platform: ${platform}`);

    // Prepare the payload to send to Lambda
    const payload = {
      platform,
    };

    // Create the Lambda invoke command with Event invocation type (asynchronous)
    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event', // Asynchronous invocation
      Payload: JSON.stringify(payload),
    });

    // Invoke the Lambda function
    await lambdaClient.send(command);

    logger.log(`Successfully triggered Lambda function for platform: ${platform}`);
  } catch (error) {
    logger.error(`Error triggering Lambda function: ${error.message}`, error.stack);
    // Don't throw error to prevent disrupting the main OTP status update flow
  }
}
