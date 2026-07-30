import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BookingBulkPropertyRunJobGroupedType,
  BookingPropertyRunJobType,
} from './booking-run.validation';

export class BookingPropertyRunJobRequestDto implements BookingPropertyRunJobType {
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'Selected booking scraper URL document id from booking_scraper_urls',
  })
  booking_scraper_url_id: string;

  @ApiProperty({
    example: '507f1f77bcf86cd799439012',
    description: 'MongoDB ObjectId of the Booking job to run',
  })
  jobId: string;
}

export class BookingBulkPropertyRunJobGroupedRequestDto
  implements BookingBulkPropertyRunJobGroupedType
{
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'Selected booking scraper URL document id from booking_scraper_urls',
  })
  booking_scraper_url_id: string;

  @ApiProperty({
    type: [String],
    example: ['507f1f77bcf86cd799439012', '507f1f77bcf86cd799439013'],
    description: 'Booking job IDs to run. Dates and property are loaded from each job record.',
  })
  job_ids: string[];

  @ApiPropertyOptional({
    description:
      'Optional ScheduledJob document id forwarded to the Booking scraper as scheduled_job_id',
  })
  scheduled_job_id?: string;
}
