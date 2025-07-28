import { ApiProperty } from '@nestjs/swagger';
import { 
  IPlatformRunJobRequest, 
  IPlatformRunJobResponse, 
  IPlatformStopJobRequest, 
  IPlatformStopJobResponse,
  IPlatformRerunFailedJobRequest,
  IPlatformRerunFailedJobResponse 
} from '../platform.dto';

export class PropertyRunJobRequestDto implements IPlatformRunJobRequest {
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

export class PropertyRunJobResponseDto implements IPlatformRunJobResponse {
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

export class ReservationRunJobResponseDto implements IPlatformRunJobResponse {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({ example: 'Reservation search completed successfully' })
  message: string;

  @ApiProperty({ type: [ReservationDto] })
  reservations: ReservationDto[];

  @ApiProperty({ example: 'reservation_job_1703123456789' })
  jobId: string;
}

// Stop Job DTOs
export class ExpediaStopJobRequestDto implements IPlatformStopJobRequest {
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'MongoDB ObjectId of the job to stop',
  })
  jobId: string;
}

export class ExpediaStopJobResponseDto implements IPlatformStopJobResponse {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({ example: 'Expedia scraping job stopped successfully' })
  message: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  jobId: string;

  @ApiProperty({ example: 'Cancelled' })
  finalStatus: string;
}

// Rerun Failed Job DTOs
export class ExpediaRerunFailedJobRequestDto implements IPlatformRerunFailedJobRequest {
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

export class ExpediaRerunFailedJobResponseDto implements IPlatformRerunFailedJobResponse {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({ example: 'Failed or cancelled expedia job rerun completed successfully' })
  message: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  jobId: string;

  @ApiProperty({ example: 'Failed' })
  originalStatus: string;

  @ApiProperty({ example: 'Completed' })
  finalStatus: string;

  @ApiProperty({ example: 2, required: false })
  retryAttempt?: number;

  @ApiProperty({ required: false })
  progress?: any;
}
