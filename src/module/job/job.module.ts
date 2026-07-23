import { Logger, Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { EncryptionUtil } from 'src/common/utils/encryption.util';
import { DatabaseService } from '../database/database.service';
import { PropertyModule } from '../property/property.module';
import { RecurringJobModule } from '../recurring-job/recurring-job.module';
import { ScraperModule } from '../scraper/scraper.module';
import { ServerModule } from '../server/server.module';
import { ExternalJwtGuard } from '../qa-panel/guards/external-jwt.guard';
import { JobController } from './job.controller';
import { JobRepository } from './job.repository';
import { JobService } from './job.service';

@Module({
  imports: [
    forwardRef(() => ScraperModule),
    forwardRef(() => RecurringJobModule),
    PropertyModule,
    ServerModule,
    JwtModule.register({}),
  ],
  controllers: [JobController],
  providers: [
    {
      provide: 'IJobService',
      useClass: JobService,
    },
    {
      provide: 'IJobRepository',
      useClass: JobRepository,
    },
    DatabaseService,
    Logger,
    EncryptionUtil,
    ConfigService,
    ExternalJwtGuard,
  ],
  exports: ['IJobService', 'IJobRepository'],
})
export class JobModule {}
