import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { BookingScraperUrlController } from './booking-scraper-url.controller';
import { BookingScraperUrlRepository } from './booking-scraper-url.repository';
import { BookingScraperUrlService } from './booking-scraper-url.service';

@Module({
  imports: [DatabaseModule, ConfigModule],
  controllers: [BookingScraperUrlController],
  providers: [
    BookingScraperUrlRepository,
    {
      provide: 'IBookingScraperUrlService',
      useClass: BookingScraperUrlService,
    },
    {
      provide: 'IBookingScraperUrlRepository',
      useClass: BookingScraperUrlRepository,
    },
  ],
  exports: ['IBookingScraperUrlService', 'IBookingScraperUrlRepository'],
})
export class BookingScraperUrlModule {}
