import { Logger, Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PropertyController } from './property.controller';
import { PropertyRepository } from './property.repository';
import { PropertyService } from './property.service';

@Module({
  imports: [],
  controllers: [PropertyController],
  providers: [
    {
      provide: 'IPropertyService',
      useClass: PropertyService,
    },
    {
      provide: 'IPropertyRepository',
      useClass: PropertyRepository,
    },
    DatabaseService,
    Logger,
  ],
  exports: ['IPropertyService', 'IPropertyRepository'],
})
export class PropertyModule {}
