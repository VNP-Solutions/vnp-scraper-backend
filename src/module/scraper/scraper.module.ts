import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScraperController } from './scraper.controller';

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [ScraperController],
})
export class ScraperModule {}
