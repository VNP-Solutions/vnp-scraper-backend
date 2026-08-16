import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { EncryptionUtil } from 'src/common/utils/encryption.util';
import { DatabaseService } from '../database/database.service';
import { ExternalJwtGuard } from '../qa-panel/guards/external-jwt.guard';
import { PropertyController } from './property.controller';
import { PropertyRepository } from './property.repository';
import { PropertyService } from './property.service';
import { ServiceTokenGuard } from './guards/service-token';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
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
    ExternalJwtGuard,
    DatabaseService,
    Logger,
    EncryptionUtil,
    ConfigService,
    ServiceTokenGuard,
  ],
  exports: ['IPropertyService', 'IPropertyRepository'],
})
export class PropertyModule {}
