import { HttpModule } from '@nestjs/axios';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { ScraperJobItemRepository } from './scraper-job-item.repository';
import { ScraperJobItemService } from './scraper-job-item.service';
import { ScraperController } from './scraper.controller';

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [ScraperController],
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
