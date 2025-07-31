import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionUtil } from 'src/common/utils/encryption.util';
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
    EncryptionUtil,
    ConfigService,
  ],
  exports: ['IPropertyCredentialsService', 'IPropertyCredentialsRepository'],
})
export class PropertyCredentialsModule {}
