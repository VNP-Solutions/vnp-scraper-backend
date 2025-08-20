import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JobModule } from '../job/job.module';
import { AgodaController } from './agoda.controller';

@Module({
  imports: [HttpModule, ConfigModule, JobModule],
  controllers: [AgodaController],
  providers: [],
})
export class AgodaModule {}
