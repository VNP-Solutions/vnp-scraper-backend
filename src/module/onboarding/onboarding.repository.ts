import { Injectable, Logger } from '@nestjs/common';
import { Onboarding } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { CreateOnboardingDto } from './onboarding.dto';
import { IOnboardingRepository } from './onboarding.interface';

@Injectable()
export class OnboardingRepository implements IOnboardingRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  async create(data: CreateOnboardingDto): Promise<Onboarding> {
    try {
      return await this.db.onboarding.create({
        data: {
          name: data.name,
          company: data.company,
          email: data.email,
          phone: data.phone,
          number_of_hotels: data.number_of_hotels,
        },
      });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
}
