import { Logger, Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PortfolioController } from './portfolio.controller';
import { PortfolioRepository } from './portfolio.repository';
import { PortfolioService } from './portfolio.service';
import { ExternalJwtGuard } from '../qa-panel/guards/external-jwt.guard';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
  controllers: [PortfolioController],
  providers: [
    {
      provide: 'IPortfolioService',
      useClass: PortfolioService,
    },
    {
      provide: 'IPortfolioRepository',
      useClass: PortfolioRepository,
    },
    DatabaseService,
    Logger,
    ExternalJwtGuard,
  ],
  exports: ['IPortfolioService', 'IPortfolioRepository'],
})
export class PortfolioModule {}
