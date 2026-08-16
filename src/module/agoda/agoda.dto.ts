import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'Connection established' })
  messge: string;
}

export class AgodaErrorResponseDto {
  @ApiProperty({ example: 500 })
  status: number;

  @ApiProperty({ example: 'Server error' })
  message: string;

  @ApiProperty({ example: 'Detailed error message', required: false })
  error?: string;
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
