import { ApiProperty } from '@nestjs/swagger';

export class BookingRunJobRequestDto {
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'Portfolio ID to scrape booking data for',
  })
  portfolioId: string;

  @ApiProperty({
    example: '507f1f77bcf86cd799439012',
    description: 'Property ID to scrape booking data for',
    required: false,
  })
  propertyId?: string;

  @ApiProperty({
    example: '01/01/2024',
    description: 'Start date for booking scraping (MM/DD/YYYY format)',
  })
  startDate: string;

  @ApiProperty({
    example: '01/31/2024', 
    description: 'End date for booking scraping (MM/DD/YYYY format)',
  })
  endDate: string;

  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'MongoDB ObjectId of the job to run.',
  })
  jobId: string;
}

export class BookingRunJobResponseDto {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({ example: 'Booking scraping job started successfully' })
  message: string;

  @ApiProperty({ example: 'booking_job_1703123456789' })
  jobId: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  portfolioId: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439012', required: false })
  propertyId?: string;
}

export class BookingStopJobRequestDto {
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'MongoDB ObjectId of the job to stop',
  })
  jobId: string;
}

export class BookingStopJobResponseDto {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({ example: 'Booking scraping job stopped successfully' })
  message: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  jobId: string;

  @ApiProperty({ example: 'Cancelled' })
  finalStatus: string;
}
