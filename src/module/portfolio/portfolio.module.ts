import { Logger, Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PortfolioController } from './portfolio.controller';
import { PortfolioRepository } from './portfolio.repository';
import { PortfolioService } from './portfolio.service';

@Module({
  imports: [],
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
  ],
  exports: ['IPortfolioService', 'IPortfolioRepository'],
})
export class PortfolioModule {}
