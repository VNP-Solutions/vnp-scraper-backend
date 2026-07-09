import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionUtil } from 'src/common/utils/encryption.util';
import { DatabaseService } from '../database/database.service';
import { PropertyController } from './property.controller';
import { PropertyRepository } from './property.repository';
import { PropertyService } from './property.service';
import { ServiceTokenGuard } from './guards/service-token';
import { ExternalJwtGuard } from '../qa-panel/guards/external-jwt.guard';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_COMMUNICATION_SECRET'),
      }),
    }),
  ],
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
    ExternalJwtGuard
  ],
  exports: ['IPropertyService', 'IPropertyRepository'],
})
export class PropertyModule {}
