import { ApiProperty } from '@nestjs/swagger';
import { 
  IPlatformRunJobRequest, 
  IPlatformRunJobResponse,
} from '../platform.dto';

export class BookingRunJobRequestDto implements IPlatformRunJobRequest {
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'MongoDB ObjectId of the job to run.',
  })
  jobId: string;
}

export class BookingRunJobResponseDto implements IPlatformRunJobResponse {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({ example: 'Booking scraping job started successfully' })
  message: string;

  @ApiProperty({ example: 'booking_job_1703123456789' })
  jobId: string;
}