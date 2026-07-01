import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ExternalJwtGuard } from './guards/external-jwt.guard';
import { DatabaseService } from '../database/database.service';
import { PortfolioController } from './portfolio.controller';
import { PortfolioRepository } from './portfolio.repository';
import { PortfolioService } from './portfolio.service';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>('JWT_COMMUNICATION_SECRET') ??
          configService.get<string>('DASHBOARD_PROXY_SECRET'),
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
    ExternalJwtGuard,
    DatabaseService,
    Logger,
  ],
  exports: ['IPortfolioService', 'IPortfolioRepository'],
})
export class PortfolioModule {}
