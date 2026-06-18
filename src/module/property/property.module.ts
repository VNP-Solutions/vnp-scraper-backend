import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionUtil } from 'src/common/utils/encryption.util';
import { DatabaseService } from '../database/database.service';
import { PropertyController } from './property.controller';
import { PropertyRepository } from './property.repository';
import { PropertyService } from './property.service';
import { ServiceTokenGuard } from './guards/service-token.guard';

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
    EncryptionUtil,
    ConfigService,
    ServiceTokenGuard,
  ],
  exports: ['IPropertyService', 'IPropertyRepository'],
})
export class PropertyModule {}
