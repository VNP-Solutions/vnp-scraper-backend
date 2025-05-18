import { Logger, Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PropertyCredentialsController } from './property-credentials.controller';
import { PropertyCredentialsRepository } from './property-credentials.repository';
import { PropertyCredentialsService } from './property-credentials.service';

@Module({
  imports: [],
  controllers: [PropertyCredentialsController],
  providers: [
    {
      provide: 'IPropertyCredentialsService',
      useClass: PropertyCredentialsService,
    },
    {
      provide: 'IPropertyCredentialsRepository',
      useClass: PropertyCredentialsRepository,
    },
    DatabaseService,
    Logger,
  ],
  exports: ['IPropertyCredentialsService', 'IPropertyCredentialsRepository'],
})
export class PropertyCredentialsModule {}
