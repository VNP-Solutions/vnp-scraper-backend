import { ApiProperty } from '@nestjs/swagger';
import {
  CreateAgodaEmailType,
  UpdateAgodaEmailType,
} from './agoda-email.validation';

export class CreateAgodaEmailDto implements CreateAgodaEmailType {
  @ApiProperty({
    description: 'Job this email was captured for',
    example: '65f0a3c4e2b7a1d2c3e4f5a6',
  })
  job_id: string;

  @ApiProperty({
    description: 'Provider message id of the email',
    example: '18f2c1a9b7d4e001',
  })
  email_id: string;

  @ApiProperty({ required: false, description: 'Email subject line' })
  subject?: string;

  @ApiProperty({ required: false, description: 'Raw email body' })
  email_body?: string;

  @ApiProperty({ required: false, description: 'Sender address' })
  from?: string;

  @ApiProperty({ required: false, description: 'Recipient address' })
  to?: string;

  @ApiProperty({
    required: false,
    type: [String],
    description: 'Screenshot URLs captured for this email',
    example: ['https://s3.amazonaws.com/bucket/agoda-email-1.png'],
  })
  screenshots?: string[];
}

export class UpdateAgodaEmailDto implements UpdateAgodaEmailType {
  @ApiProperty({ required: false })
  job_id?: string;

  @ApiProperty({ required: false })
  email_id?: string;

  @ApiProperty({ required: false })
  subject?: string;

  @ApiProperty({ required: false })
  email_body?: string;

  @ApiProperty({ required: false })
  from?: string;

  @ApiProperty({ required: false })
  to?: string;

  @ApiProperty({ required: false, type: [String] })
  screenshots?: string[];
}

export class AgodaEmailResponseDto {
  @ApiProperty({ description: 'Agoda email ID' })
  id: string;

  @ApiProperty({ description: 'Job this email belongs to' })
  job_id: string;

  @ApiProperty({ description: 'Provider message id of the email' })
  email_id: string;

  @ApiProperty({ required: false })
  subject?: string;

  @ApiProperty({ required: false })
  email_body?: string;

  @ApiProperty({ required: false })
  from?: string;

  @ApiProperty({ required: false })
  to?: string;

  @ApiProperty({ type: [String] })
  screenshots: string[];

  @ApiProperty({ description: 'Created timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Updated timestamp' })
  updatedAt: Date;
}

export class AgodaEmailListResponseDto {
  @ApiProperty({ type: [AgodaEmailResponseDto] })
  items: AgodaEmailResponseDto[];

  @ApiProperty({ description: 'Total number of documents' })
  totalDocuments: number;

  @ApiProperty({ description: 'Current page number' })
  currentPage: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPage: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;
}
