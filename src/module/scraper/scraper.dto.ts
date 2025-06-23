import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'Connection established' })
  messge: string;
}

export class ErrorResponseDto {
  @ApiProperty({ example: 500 })
  status: number;

  @ApiProperty({ example: 'Server error' })
  message: string;

  @ApiProperty({ example: 'Detailed error message', required: false })
  error?: string;
}

export class ScrapingStateDto {
  @ApiProperty({ example: 'running' })
  state: string;

  @ApiProperty({ example: 50 })
  progress: number;
}

export class ScrapingStatusResponseDto {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({ example: 'Scraping status retrieved successfully' })
  message: string;

  @ApiProperty({ type: ScrapingStateDto })
  data: ScrapingStateDto;
}

export class PauseResumeStopResponseDto {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({ example: 'Scraping paused successfully' })
  message: string;

  @ApiProperty({ type: ScrapingStateDto, required: false })
  data?: ScrapingStateDto;
}

export class PropertyRunJobRequestDto {
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

  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'MongoDB ObjectId of the job to run.',
  })
  jobId: string;
}

export class PropertyRunJobResponseDto {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({ example: 'Property search completed successfully' })
  message: string;

  @ApiProperty({ example: '12345' })
  propertyId: string;

  @ApiProperty({ example: 'job_12345_1703123456789' })
  jobId: string;
}

export class ReservationDto {
  @ApiProperty({ example: 'RES123' })
  reservationId: string;

  @ApiProperty({ example: 'PROP456' })
  propertyId: string;
}

export class ReservationRunJobRequestDto {
  @ApiProperty({ type: [ReservationDto] })
  reservations: ReservationDto[];
}

export class ReservationRunJobResponseDto {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({ example: 'Reservation search completed successfully' })
  message: string;

  @ApiProperty({ type: [ReservationDto] })
  reservations: ReservationDto[];

  @ApiProperty({ example: 'reservation_job_1703123456789' })
  jobId: string;
}

export class AllJobItemsResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiProperty({ description: 'Array of job items', type: 'array' })
  data: any[];

  @ApiProperty({
    description: 'Response metadata',
    example: { total: 25, jobId: '507f1f77bcf86cd799439011' },
  })
  metadata: {
    total: number;
    jobId: string;
  };
}
