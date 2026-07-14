import { Logger, Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PortfolioController } from './portfolio.controller';
import { PortfolioRepository } from './portfolio.repository';
import { PortfolioService } from './portfolio.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ExternalJwtGuard } from '../qa-panel/guards/external-jwt.guard';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
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
    ConfigService,
    DatabaseService,
    Logger,
  ],
  exports: ['IPortfolioService', 'IPortfolioRepository'],
})
export class PortfolioModule {}
