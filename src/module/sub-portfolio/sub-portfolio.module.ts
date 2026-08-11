import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { SubPortfolioController } from './sub-portfolio.controller';
import { SubPortfolioRepository } from './sub-portfolio.repository';
import { SubPortfolioService } from './sub-portfolio.service';
import { DatabaseService } from '../database/database.service';
import { ExternalJwtGuard } from '../qa-panel/guards/external-jwt.guard';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>('JWT_COMMUNICATION_SECRET') ??
          configService.get<string>('SECRET_KEY'),
      }),
    }),
  ],
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
    ExternalJwtGuard,
  ],
  exports: ['ISubPortfolioService', 'ISubPortfolioRepository'],
})
export class SubPortfolioModule {}
