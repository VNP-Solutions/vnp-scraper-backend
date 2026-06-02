import { Onboarding } from '@prisma/client';
import { CreateOnboardingDto } from './onboarding.dto';

export interface IOnboardingRepository {
  create(data: CreateOnboardingDto): Promise<Onboarding>;
  findAllByQuery(
    query: Record<string, any>,
  ): Promise<{ data: any[]; metadata: any }>;
}

export interface IOnboardingService {
  create(data: CreateOnboardingDto): Promise<Onboarding>;
  findAll(query: Record<string, any>): Promise<{ data: any[]; metadata: any }>;
}
