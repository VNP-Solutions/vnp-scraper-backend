import { ApiProperty } from '@nestjs/swagger';

// Generic interfaces for all scraper platforms
export interface IPlatformRunJobRequest {
  jobId: string;
  startDate?: string;
  endDate?: string;
}

export interface IPlatformRunJobResponse {
  status: number;
  message: string;
  jobId: string;
}

export interface IPlatformStopJobRequest {
  jobId: string;
}

export interface IPlatformStopJobResponse {
  status: number;
  message: string;
  jobId: string;
  finalStatus: string;
}

export interface IPlatformRerunFailedJobRequest {
  jobId: string;
  startDate?: string;
  endDate?: string;
}

export interface IPlatformRerunFailedJobResponse {
  status: number;
  message: string;
  jobId: string;
  originalStatus: string;
  finalStatus: string;
  retryAttempt?: number;
  progress?: any;
}

// Generic DTOs that can be used by all platforms
export class JobProgressDto {
  @ApiProperty({ example: 150 })
  totalItems: number;

  @ApiProperty({ example: 140 })
  itemsWithCardInfo: number;

  @ApiProperty({ example: 135 })
  itemsWithPaymentInfo: number;

  @ApiProperty({ example: 90 })
  completionPercentage: number;
}

export class StopJobRequestDto implements IPlatformStopJobRequest {
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'MongoDB ObjectId of the job to stop',
  })
  jobId: string;
}

export class StopJobResponseDto implements IPlatformStopJobResponse {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({ example: 'Scraping job stopped successfully' })
  message: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  jobId: string;

  @ApiProperty({ example: 'Cancelled' })
  finalStatus: string;
}

export class RerunFailedJobRequestDto implements IPlatformRerunFailedJobRequest {
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'MongoDB ObjectId of the failed or cancelled job to rerun',
  })
  jobId: string;

  @ApiProperty({
    example: '01/01/2024',
    description: 'Start date for scraping (MM/DD/YYYY format)',
  })
  startDate: string;

  @ApiProperty({
    example: '01/31/2024',
    description: 'End date for scraping (MM/DD/YYYY format)',
  })
  endDate: string;
}

export class RerunFailedJobResponseDto implements IPlatformRerunFailedJobResponse {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({ example: 'Failed job rerun completed successfully' })
  message: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  jobId: string;

  @ApiProperty({ example: 'Failed' })
  originalStatus: string;

  @ApiProperty({ example: 'Completed' })
  finalStatus: string;

  @ApiProperty({ type: JobProgressDto })
  progress: JobProgressDto;
}

