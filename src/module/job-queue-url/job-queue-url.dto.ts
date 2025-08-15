import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobQueueUrlStatus } from '@prisma/client';

export class CreateJobQueueUrlDto {
  @ApiProperty({
    description: 'Descriptive name for the URL/server',
    example: 'Primary Scraper Server',
  })
  name: string;

  @ApiProperty({
    description: 'The URL of the server',
    example: 'http://scraper-server-1.com:3000',
  })
  url: string;

  @ApiPropertyOptional({
    description: 'Optional description of the server',
    example: 'Main scraper server for property data',
  })
  description?: string;

  @ApiPropertyOptional({
    description: 'Priority level (higher number = higher priority)',
    example: 5,
    minimum: 1,
    maximum: 10,
  })
  priority?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of concurrent jobs this URL can handle',
    example: 3,
    minimum: 1,
  })
  max_concurrent_jobs?: number;

  @ApiPropertyOptional({
    description: 'Whether the URL is active and available for use',
    example: true,
  })
  is_active?: boolean;
}

export class UpdateJobQueueUrlDto {
  @ApiPropertyOptional({
    description: 'Descriptive name for the URL/server',
    example: 'Updated Server Name',
  })
  name?: string;

  @ApiPropertyOptional({
    description: 'The URL of the server',
    example: 'http://updated-server.com:3000',
  })
  url?: string;

  @ApiPropertyOptional({
    description: 'Current status of the URL',
    enum: JobQueueUrlStatus,
    example: JobQueueUrlStatus.Available,
  })
  status?: JobQueueUrlStatus;

  @ApiPropertyOptional({
    description: 'Optional description of the server',
    example: 'Updated server description',
  })
  description?: string;

  @ApiPropertyOptional({
    description: 'Priority level (higher number = higher priority)',
    example: 3,
    minimum: 1,
    maximum: 10,
  })
  priority?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of concurrent jobs this URL can handle',
    example: 2,
    minimum: 1,
  })
  max_concurrent_jobs?: number;

  @ApiPropertyOptional({
    description: 'Whether the URL is active and available for use',
    example: false,
  })
  is_active?: boolean;
}

export class BookUrlRequestDto {
  @ApiProperty({
    description: 'The job ID that needs a URL',
    example: '507f1f77bcf86cd799439011',
  })
  jobId: string;
}

export class JobQueueUrlResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string;

  @ApiProperty({ example: 'Primary Scraper Server' })
  name: string;

  @ApiProperty({ example: 'http://scraper-server-1.com:3000' })
  url: string;

  @ApiProperty({
    enum: JobQueueUrlStatus,
    example: JobQueueUrlStatus.Available,
  })
  status: JobQueueUrlStatus;

  @ApiPropertyOptional({ example: 'Main scraper server for property data' })
  description?: string;

  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439012' })
  assigned_to_job_id?: string;

  @ApiPropertyOptional()
  last_used?: Date;

  @ApiProperty({ example: 5 })
  priority: number;

  @ApiProperty({ example: 3 })
  max_concurrent_jobs: number;

  @ApiProperty({ example: 1 })
  current_job_count: number;

  @ApiProperty({ example: true })
  is_active: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class BookUrlResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'URL booked successfully' })
  message: string;

  @ApiPropertyOptional({ type: JobQueueUrlResponseDto })
  url?: JobQueueUrlResponseDto;
}

export class ErrorResponseDto {
  @ApiProperty({ example: false })
  success: boolean;

  @ApiProperty({ example: 'Error message' })
  message: string;

  @ApiPropertyOptional()
  error?: any;
}
