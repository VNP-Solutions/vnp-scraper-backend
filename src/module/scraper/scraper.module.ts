import { HttpModule } from '@nestjs/axios';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { BookingController } from './booking/booking.controller';
import { ExpediaController } from './expedia/expedia.controller';
import { ScraperJobItemRepository } from './scraper-job-item.repository';
import { ScraperJobItemService } from './scraper-job-item.service';

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [ExpediaController, BookingController],
  providers: [
    {
      provide: 'IScraperJobItemService',
      useClass: ScraperJobItemService,
    },
    {
      provide: 'IScraperJobItemRepository',
      useClass: ScraperJobItemRepository,
    },
    DatabaseService,
    Logger,
  ],
})
export class ScraperModule {}
