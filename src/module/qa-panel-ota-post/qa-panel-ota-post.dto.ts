import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QaPanelStatus } from '@prisma/client';
import {
  BulkDeleteQaPanelOtaPostType,
  CreateQaPanelOtaPostType,
  QaPanelOtaPostFailedReasonType,
  QaPanelOtaPostImportCallbackType,
  UpdateQaPanelOtaPostType,
} from './qa-panel-ota-post.validation';

export class QaPanelOtaPostFailedReasonDto implements QaPanelOtaPostFailedReasonType {
  @ApiProperty({ example: 5, description: 'Row number in the uploaded file' })
  row_number: number;

  @ApiProperty({ example: 'Invalid OTA value', description: 'Failure reason' })
  reason: string;
}

export class CreateQaPanelOtaPostDto implements CreateQaPanelOtaPostType {
  @ApiProperty({
    example: 'https://bucket.s3.amazonaws.com/uploads/123456-report.xlsx',
  })
  file_url: string;

  @ApiProperty({ example: 'report.xlsx' })
  file_name: string;

  @ApiProperty({ enum: QaPanelStatus, example: QaPanelStatus.Processing })
  status: QaPanelStatus;

  @ApiPropertyOptional({
    type: [QaPanelOtaPostFailedReasonDto],
    example: [{ row_number: 5, reason: 'Invalid OTA value' }],
  })
  failed_reasons?: QaPanelOtaPostFailedReasonDto[];
}

export class UpdateQaPanelOtaPostDto implements UpdateQaPanelOtaPostType {
  @ApiPropertyOptional({
    example: 'https://bucket.s3.amazonaws.com/uploads/123456-report.xlsx',
  })
  file_url?: string;

  @ApiPropertyOptional({ example: 'report.xlsx' })
  file_name?: string;

  @ApiPropertyOptional({ enum: QaPanelStatus, example: QaPanelStatus.Failed })
  status?: QaPanelStatus;

  @ApiPropertyOptional({
    type: [QaPanelOtaPostFailedReasonDto],
    example: [{ row_number: 5, reason: 'Invalid OTA value' }],
  })
  failed_reasons?: QaPanelOtaPostFailedReasonDto[];
}

export class BulkDeleteQaPanelOtaPostDto implements BulkDeleteQaPanelOtaPostType {
  @ApiProperty({
    type: [String],
    example: ['507f1f77bcf86cd799439011'],
  })
  ids: string[];
}

export class QaPanelOtaPostResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string;

  @ApiProperty({
    example: 'https://bucket.s3.amazonaws.com/uploads/123456-report.xlsx',
  })
  file_url: string;

  @ApiProperty({ example: 'report.xlsx' })
  file_name: string;

  @ApiProperty({ enum: QaPanelStatus, example: QaPanelStatus.Processing })
  status: QaPanelStatus;

  @ApiProperty({
    type: [QaPanelOtaPostFailedReasonDto],
    example: [{ row_number: 5, reason: 'Invalid OTA value' }],
  })
  failed_reasons: QaPanelOtaPostFailedReasonDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class QaPanelOtaPostListResponseDto {
  @ApiProperty({ type: [QaPanelOtaPostResponseDto] })
  data: QaPanelOtaPostResponseDto[];

  @ApiProperty({
    example: {
      totalDocuments: 1,
      currentPage: 1,
      totalPage: 1,
      limit: 10,
    },
  })
  metadata: {
    totalDocuments: number;
    currentPage: number;
    totalPage: number;
    limit: number;
  };
}

export class QaPanelOtaPostProxyResponseDto {
  @ApiProperty({
    example: true,
    description: 'Whether the dashboard proxy accepted the import',
  })
  success: boolean;

  @ApiProperty({
    example: 'Import is on Processing',
    description: 'Message returned by the dashboard proxy API',
  })
  message: string;
}

export class QaPanelOtaPostUploadApiResponseDto {
  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({
    example: 'Import is on Processing',
    description: 'Uses the proxy message when available',
  })
  message: string;

  @ApiProperty({
    type: QaPanelOtaPostProxyResponseDto,
    description: 'Raw response from the dashboard bulk-audit-import API',
  })
  data: QaPanelOtaPostProxyResponseDto;
}

export class QaPanelOtaPostImportCallbackReportDto {
  @ApiProperty({ example: 30 })
  total: number;

  @ApiProperty({ example: 20 })
  success: number;

  @ApiProperty({ example: 10 })
  failed: number;
}

export class QaPanelOtaPostImportCallbackErrorDto {
  @ApiProperty({ example: 2 })
  row: number;

  @ApiProperty({ example: "Portfolio not found with name 'Some portfolio'" })
  failed_reason: string;
}

export class QaPanelOtaPostImportCallbackDto implements QaPanelOtaPostImportCallbackType {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  qa_panel_id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({
    enum: ['success', 'failed', 'Success', 'Failed'],
    example: 'Failed',
    description: 'Import result. Accepts success/Success or failed/Failed.',
  })
  status: 'success' | 'failed';

  @ApiProperty({ type: QaPanelOtaPostImportCallbackReportDto })
  report: QaPanelOtaPostImportCallbackReportDto;

  @ApiProperty({
    type: [QaPanelOtaPostImportCallbackErrorDto],
    example: [
      {
        row: 2,
        failed_reason: "Portfolio not found with name 'Some portfolio'",
      },
    ],
  })
  errors: QaPanelOtaPostImportCallbackErrorDto[];
}

export class GenerateCommunicationTokenOtaPostResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT signed with JWT_COMMUNICATION_SECRET',
  })
  token: string;

  @ApiProperty({ example: '1d', description: 'Token expiry duration' })
  expiresIn: string;
}

export class GenerateCommunicationTokenOtaPostApiResponseDto {
  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({ example: 'Communication token generated successfully' })
  message: string;

  @ApiProperty({ type: GenerateCommunicationTokenOtaPostResponseDto })
  data: GenerateCommunicationTokenOtaPostResponseDto;
}
