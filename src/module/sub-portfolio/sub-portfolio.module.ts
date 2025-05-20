import { Logger, Module } from '@nestjs/common';
import { SubPortfolioController } from './sub-portfolio.controller';
import { SubPortfolioRepository } from './sub-portfolio.repository';
import { SubPortfolioService } from './sub-portfolio.service';
import { DatabaseService } from '../database/database.service';

@Module({
  imports: [],
  controllers: [SubPortfolioController],
  providers: [
    {
      provide: 'ISubPortfolioService',
      useClass: SubPortfolioService,
    },
    {
      provide: 'ISubPortfolioRepository',
      useClass: SubPortfolioRepository,
    },
    DatabaseService,
    Logger,
  ],
  exports: ['ISubPortfolioService', 'ISubPortfolioRepository'],
})
export class SubPortfolioModule {}
