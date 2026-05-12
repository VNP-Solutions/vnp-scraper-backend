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

  async findAllByQuery(
    query: Record<string, any>,
  ): Promise<{ data: Onboarding[]; metadata: any }> {
    const { page, limit, sortBy, sortOrder, search, start_date, end_date } =
      query || {};

    const skip = page
      ? (parseInt(String(page || '1'), 10) - 1) * parseInt(String(limit || '10'), 10)
      : 0;
    const take = limit ? parseInt(String(limit), 10) : 10;

    let orderBy: { [key: string]: 'asc' | 'desc' } = { createdAt: 'desc' };
    if (sortBy) {
      orderBy = {
        [sortBy]: sortOrder?.toString().toLowerCase() === 'desc' ? 'desc' : 'asc',
      };
    }

    let where: any = {};

    if (search) {
      const searchTerm = search.toString().trim();
      const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(searchTerm);
      const hotelsInt = parseInt(searchTerm, 10);
      const hotelsMatch =
        searchTerm !== '' &&
        !Number.isNaN(hotelsInt) &&
        String(hotelsInt) === searchTerm;

      where = {
        ...where,
        OR: [
          ...(isValidObjectId ? [{ id: searchTerm }] : []),
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { company: { contains: searchTerm, mode: 'insensitive' } },
          { email: { contains: searchTerm, mode: 'insensitive' } },
          { phone: { contains: searchTerm, mode: 'insensitive' } },
          ...(hotelsMatch ? [{ number_of_hotels: hotelsInt }] : []),
        ],
      };
    }

    if (start_date && end_date) {
      where = {
        ...where,
        createdAt: {
          gte: new Date(start_date),
          lte: new Date(end_date),
        },
      };
    }

    try {
      const [data, totalDocuments] = await Promise.all([
        this.db.onboarding.findMany({
          where,
          skip,
          take,
          orderBy,
        }),
        this.db.onboarding.count({ where }),
      ]);

      const metadata = {
        totalDocuments,
        currentPage: parseInt(String(page || '1'), 10),
        totalPage: Math.ceil(totalDocuments / take) || 0,
        limit: take,
      };

      return { data, metadata };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
}
