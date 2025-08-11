import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JobQueueUrlModule } from '../job-queue-url/job-queue-url.module';
import { AgodaController } from './agoda.controller';

@Module({
  imports: [HttpModule, ConfigModule, JobQueueUrlModule],
  controllers: [AgodaController],
  providers: [],
})
export class AgodaModule {}
