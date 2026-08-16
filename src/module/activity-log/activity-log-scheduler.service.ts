import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { promises as fs } from 'fs';
import { join } from 'path';
import { S3UploadService } from '../../common/utils/s3-upload.util';
import { IActivityLogExportService } from '../activity-log-export/activity-log-export.interface';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ActivityLogSchedulerService {
  private readonly logger = new Logger(ActivityLogSchedulerService.name);
  private readonly exportsDirectory = join(
    process.cwd(),
    'activity-log-exports',
  );

  constructor(
    private readonly db: DatabaseService,
    private readonly s3UploadService: S3UploadService,
    @Inject('IActivityLogExportService')
    private readonly activityLogExportService: IActivityLogExportService,
  ) {
    this.ensureExportsDirectory();
  }

  private async ensureExportsDirectory() {
    try {
      await fs.mkdir(this.exportsDirectory, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create exports directory:', error);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleActivityLogExport() {
    this.logger.log('Starting ActivityLog export and cleanup job...');

    try {
      // Get previous day's date in YYYY-MM-DD format (UTC)
      const now = new Date();
      const yesterday = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
      );
      const dateString = yesterday.toISOString().split('T')[0];
      const fileName = `${dateString}.json`;
      const filePath = join(this.exportsDirectory, fileName);

      // Fetch all ActivityLog data
      this.logger.log('Fetching all ActivityLog data...');
      const allLogs = await this.db.activityLog.findMany({
        orderBy: {
          timestamp: 'desc',
        },
      });

      this.logger.log(`Found ${allLogs.length} activity logs to export`);

      // Convert to JSON format
      const jsonData = JSON.stringify(allLogs, null, 2);

      // Write to JSON file
      await fs.writeFile(filePath, jsonData, 'utf-8');
      this.logger.log(`ActivityLog data exported to ${filePath}`);

      // Upload to S3
      const s3Key = `activity-logs/${fileName}`;
      const s3Url = await this.s3UploadService.uploadFileFromPath(
        filePath,
        s3Key,
        'application/json',
      );
      this.logger.log(`ActivityLog data uploaded to S3: ${s3Url}`);

      // Save export record to database
      await this.activityLogExportService.createExport({
        fileName,
        s3Url,
        exportDate: yesterday,
      });
      this.logger.log(`ActivityLog export record saved to database`);

      // Delete local file after successful S3 upload
      try {
        await fs.unlink(filePath);
        this.logger.log(`Local file deleted: ${filePath}`);
      } catch (error) {
        this.logger.warn(`Failed to delete local file ${filePath}:`, error);
      }

      // Clear all ActivityLog data from database
      if (allLogs.length > 0) {
        const deleteResult = await this.db.activityLog.deleteMany({});
        this.logger.log(
          `Cleared ${deleteResult.count} activity logs from database`,
        );
      } else {
        this.logger.log('No activity logs to clear from database');
      }

      this.logger.log(
        'ActivityLog export and cleanup job completed successfully',
      );
    } catch (error) {
      this.logger.error('Error during ActivityLog export and cleanup:', error);
    }
  }
}
