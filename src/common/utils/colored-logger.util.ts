/**
 * Colored Logger Utility
 * Provides colored console output for different log levels.
 * Mirrors vnp-dashboard-backend/src/common/utils/colored-logger.util.ts so
 * the bulk property sync logs read consistently across all three backends.
 */

export enum LogLevel {
  INFO = 'INFO',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  WARN = 'WARN',
  STEP = 'STEP',
}

export class ColoredLogger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    colorCode: string,
  ): void {
    const timestamp = new Date().toISOString();
    const reset = '\x1b[0m';
    const formattedMessage = `${colorCode}[${timestamp}] [${level}] [${this.context}] ${message}${reset}\n`;
    process.stdout.write(formattedMessage);
  }

  info(message: string): void {
    this.formatMessage(LogLevel.INFO, message, '\x1b[36m'); // Cyan
  }

  success(message: string): void {
    this.formatMessage(LogLevel.SUCCESS, message, '\x1b[32m'); // Green
  }

  error(message: string): void {
    this.formatMessage(LogLevel.ERROR, message, '\x1b[31m'); // Red
  }

  warn(message: string): void {
    this.formatMessage(LogLevel.WARN, message, '\x1b[33m'); // Yellow
  }

  step(message: string): void {
    this.formatMessage(LogLevel.STEP, message, '\x1b[35m'); // Magenta
  }
}
