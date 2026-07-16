import { ApiProperty } from '@nestjs/swagger';
import {
  OtaPostPreChargingDelivery,
  OtaPostPreChargingStatus,
} from '@prisma/client';

export class OtaPostPreChargingResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  user_id: string;

  @ApiProperty({
    example:
      'https://bucket.s3.amazonaws.com/uploads/1781704659954-source-file.xlsx',
  })
  original_file_url: string;

  @ApiProperty({
    example:
      'https://bucket.s3.amazonaws.com/ota-post-pre-charging/1781704659954-converted.xlsx',
    nullable: true,
  })
  converted_file_url: string | null;

  @ApiProperty({ example: 'master-export.xlsx' })
  file_name: string;

  @ApiProperty({ example: 250 })
  row_count: number;

  @ApiProperty({ enum: OtaPostPreChargingDelivery, example: 'Response' })
  delivery: OtaPostPreChargingDelivery;

  @ApiProperty({ enum: OtaPostPreChargingStatus, example: 'Completed' })
  status: OtaPostPreChargingStatus;

  @ApiProperty({ example: null, nullable: true })
  error_message: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class OtaPostPreChargingListResponseDto {
  @ApiProperty({ type: [OtaPostPreChargingResponseDto] })
  data: OtaPostPreChargingResponseDto[];

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

export class OtaPostPreChargingEmailQueuedResponseDto {
  @ApiProperty({ example: 202 })
  statusCode: number;

  @ApiProperty({
    example:
      'Your converted file is being prepared. We will email a download link to user@example.com.',
  })
  message: string;

  @ApiProperty({
    example: {
      id: '507f1f77bcf86cd799439011',
      estimatedRowCount: 1500,
      delivery: 'Email',
      status: 'Processing',
      email: 'user@example.com',
    },
  })
  data: {
    id: string;
    estimatedRowCount: number;
    delivery: 'Email';
    status: 'Processing';
    email: string;
  };
}
