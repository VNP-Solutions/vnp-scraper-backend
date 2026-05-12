import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingRepository } from './onboarding.repository';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [DatabaseModule, ConfigModule],
  controllers: [OnboardingController],
  providers: [
    {
      provide: 'IOnboardingRepository',
      useClass: OnboardingRepository,
    },
    {
      provide: 'IOnboardingService',
      useClass: OnboardingService,
    },
    Logger,
  ],
  exports: ['IOnboardingService', 'IOnboardingRepository'],
})
export class OnboardingModule {}
