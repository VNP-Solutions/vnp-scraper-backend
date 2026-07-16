import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  OtaPostPreCharging,
  OtaPostPreChargingDelivery,
  OtaPostPreChargingStatus,
} from '@prisma/client';
import { basename } from 'path';
import { S3UploadService } from '../../common/utils/s3-upload.util';
import {
  buildOtaPostPreChargingWorkbook,
  convertOtaPostPreChargingRows,
  countImportDataRows,
  parseOtaPostPreChargingImportFile,
  validateOtaPostPreChargingImportHeaders,
} from './ota-post-pre-charging-converter.util';
import { OTA_POST_PRE_CHARGING_ASYNC_ROW_THRESHOLD } from './ota-post-pre-charging.constants';
import { IOtaPostPreChargingService } from './ota-post-pre-charging.interface';
import { OtaPostPreChargingRepository } from './ota-post-pre-charging.repository';
import {
  enqueueOtaPostPreChargingExport,
  getOtaPostPreChargingQueueUrl,
} from './ota-post-pre-charging-sqs.util';

@Injectable()
export class OtaPostPreChargingService implements IOtaPostPreChargingService {
  private readonly logger = new Logger(OtaPostPreChargingService.name);

  constructor(
    private readonly repository: OtaPostPreChargingRepository,
    private readonly s3UploadService: S3UploadService,
  ) {}

  async convertTemplate(
    file: Express.Multer.File,
    user: { userId: string; email: string; name?: string | null },
  ) {
    if (!file) {
      throw new BadRequestException('A CSV or XLSX file is required');
    }

    if (!user.email) {
      throw new BadRequestException('Authenticated user email not found in token');
    }

    const fileName = basename(file.originalname);
    const estimatedRowCount = countImportDataRows(file);

    if (estimatedRowCount === 0) {
      throw new BadRequestException('Uploaded file does not contain any data rows');
    }

    const originalFileUrl = await this.s3UploadService.uploadFile(file);
    const useAsyncQueue =
      estimatedRowCount >= OTA_POST_PRE_CHARGING_ASYNC_ROW_THRESHOLD;

    if (useAsyncQueue) {
      return this.enqueueAsyncConversion(
        fileName,
        originalFileUrl,
        estimatedRowCount,
        user,
      );
    }

    return this.processSyncConversion(file, fileName, originalFileUrl, user);
  }

  private async enqueueAsyncConversion(
    fileName: string,
    originalFileUrl: string,
    estimatedRowCount: number,
    user: { userId: string; email: string; name?: string | null },
  ) {
    const queueUrl = getOtaPostPreChargingQueueUrl();
    if (!queueUrl) {
      this.logger.warn(
        `Async conversion requested (${estimatedRowCount} rows) but ` +
          'OTA_POST_PRE_CHARGING_QUEUE_URL is not configured — falling back to sync.',
      );
      throw new BadRequestException(
        'Large file conversion queue is not configured. Please contact support.',
      );
    }

    const record = await this.repository.create({
      user_id: user.userId,
      original_file_url: originalFileUrl,
      file_name: fileName,
      row_count: estimatedRowCount,
      delivery: OtaPostPreChargingDelivery.Email,
      status: OtaPostPreChargingStatus.Processing,
    });

    await enqueueOtaPostPreChargingExport(
      {
        recordId: record.id,
        originalFileUrl,
        originalFileName: fileName,
        user: {
          userId: user.userId,
          email: user.email,
          name: user.name ?? null,
        },
        requestedAt: new Date().toISOString(),
      },
      this.logger,
    );

    this.logger.log(
      `Queued OTA post pre-charging conversion for ${user.email} ` +
        `(record=${record.id}, estimatedRows=${estimatedRowCount})`,
    );

    return {
      mode: 'queued' as const,
      recordId: record.id,
      estimatedRowCount,
      email: user.email,
    };
  }

  private async processSyncConversion(
    file: Express.Multer.File,
    fileName: string,
    originalFileUrl: string,
    user: { userId: string; email: string; name?: string | null },
  ) {
    const record = await this.repository.create({
      user_id: user.userId,
      original_file_url: originalFileUrl,
      file_name: fileName,
      row_count: 0,
      delivery: OtaPostPreChargingDelivery.Response,
      status: OtaPostPreChargingStatus.Processing,
    });

    try {
      const importRows = parseOtaPostPreChargingImportFile(file);
      const resolvedHeaders = validateOtaPostPreChargingImportHeaders(importRows);
      const convertedRows = convertOtaPostPreChargingRows(
        importRows,
        resolvedHeaders,
      );

      if (convertedRows.length === 0) {
        throw new BadRequestException(
          'Uploaded file does not contain any convertible data rows',
        );
      }

      const { buffer, fileName: convertedFileName } =
        buildOtaPostPreChargingWorkbook(convertedRows);

      const convertedS3Key = `ota-post-pre-charging/${user.userId}/${convertedFileName}`;
      const convertedFileUrl = await this.s3UploadService.uploadBuffer(
        convertedS3Key,
        buffer,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      await this.repository.update(record.id, {
        converted_file_url: convertedFileUrl,
        row_count: convertedRows.length,
        delivery: OtaPostPreChargingDelivery.Response,
        status: OtaPostPreChargingStatus.Completed,
        error_message: null,
      });

      this.logger.log(
        `OTA post pre-charging conversion returned in response (${convertedRows.length} rows)`,
      );

      return {
        mode: 'download' as const,
        buffer,
        fileName: convertedFileName,
        recordId: record.id,
        rowCount: convertedRows.length,
      };
    } catch (error: any) {
      await this.repository.update(record.id, {
        status: OtaPostPreChargingStatus.Failed,
        error_message: error?.message ?? 'Conversion failed',
      });
      throw error;
    }
  }

  async findAllRecords(filters?: {
    user_id?: string;
    page?: number;
    limit?: number;
    order?: 'asc' | 'desc';
  }) {
    return this.repository.findAll(filters);
  }

  async findRecordById(id: string): Promise<OtaPostPreCharging> {
    const record = await this.repository.findById(id);

    if (!record) {
      throw new NotFoundException(
        `OTA post pre-charging record with ID ${id} not found`,
      );
    }

    return record;
  }
}
