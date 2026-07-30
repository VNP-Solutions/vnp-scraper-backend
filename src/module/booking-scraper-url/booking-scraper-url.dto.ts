import { ApiProperty } from '@nestjs/swagger';
import {
  BulkDeleteBookingScraperUrlType,
  CreateBookingScraperUrlType,
  UpdateBookingScraperUrlType,
} from './booking-scraper-url.validation';

export class CreateBookingScraperUrlDto implements CreateBookingScraperUrlType {
  @ApiProperty({
    description: 'Booking scraper URL',
    example: 'https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/home.html',
  })
  url: string;
}

export class UpdateBookingScraperUrlDto implements UpdateBookingScraperUrlType {
  @ApiProperty({
    description: 'Booking scraper URL',
    example: 'https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/home.html',
  })
  url: string;
}

export class BulkDeleteBookingScraperUrlDto
  implements BulkDeleteBookingScraperUrlType
{
  @ApiProperty({
    description: 'Array of booking scraper URL IDs to delete',
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    type: [String],
  })
  ids: string[];
}

export class BookingScraperUrlResponseDto {
  @ApiProperty({ description: 'Booking scraper URL ID' })
  id: string;

  @ApiProperty({ description: 'Booking scraper URL' })
  url: string;

  @ApiProperty({ description: 'Created timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Updated timestamp' })
  updatedAt: Date;
}

export class BookingScraperUrlListResponseDto {
  @ApiProperty({ type: [BookingScraperUrlResponseDto] })
  items: BookingScraperUrlResponseDto[];

  @ApiProperty({ description: 'Total number of documents' })
  totalDocuments: number;

  @ApiProperty({ description: 'Current page number' })
  currentPage: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPage: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;
}
