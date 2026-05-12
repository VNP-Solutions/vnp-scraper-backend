import { Onboarding } from '@prisma/client';
import { CreateOnboardingDto } from './onboarding.dto';

export interface IOnboardingRepository {
  create(data: CreateOnboardingDto): Promise<Onboarding>;
}

export interface IOnboardingService {
  create(data: CreateOnboardingDto): Promise<Onboarding>;
}
