import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AgodaEmailController } from './agoda-email.controller';
import { AgodaEmailRepository } from './agoda-email.repository';
import { AgodaEmailService } from './agoda-email.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AgodaEmailController],
  providers: [
    {
      provide: 'IAgodaEmailService',
      useClass: AgodaEmailService,
    },
    {
      provide: 'IAgodaEmailRepository',
      useClass: AgodaEmailRepository,
    },
  ],
  exports: ['IAgodaEmailService', 'IAgodaEmailRepository'],
})
export class AgodaEmailModule {}
