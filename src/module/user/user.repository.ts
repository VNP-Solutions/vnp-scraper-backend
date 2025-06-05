import { Injectable, Logger } from '@nestjs/common';
import { User } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { CreateUserDto, UpdateUserDto } from './user.dto';
import { IUserRepository } from './user.interface';

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  get databaseService(): DatabaseService {
    return this.db;
  }

  async create(data: CreateUserDto): Promise<User> {
    try {
      const user = await this.db.user.create({
        data,
      });
      return user;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findAllByQuery(
    query: Record<string, any>,
  ): Promise<{ data: User[]; metadata: any }> {
    try {
      const { page, limit, sortBy, sortOrder, search, start_date, end_date } =
        query || {};
      const skip = page
        ? (parseInt(page || '1') - 1) * parseInt(limit || '10')
        : 0;
      const take = limit ? parseInt(limit) : 10;

      let orderBy = undefined;
      if (sortBy) {
        orderBy = {
          [sortBy]: sortOrder?.toLowerCase() === 'desc' ? 'desc' : 'asc',
        };
      }

      let whereCondition: any = {};
      if (search) {
        whereCondition = {
          OR: [
            {
              name: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              email: {
                contains: search,
                mode: 'insensitive',
              },
            },
          ],
        };
      }

      if (start_date && end_date) {
        whereCondition = {
          ...whereCondition,
          createdAt: {
            gte: new Date(start_date),
            lte: new Date(end_date),
          },
        };
      }

      const [users, totalDocuments] = await Promise.all([
        this.db.user.findMany({
          skip,
          take,
          orderBy,
          where: whereCondition,
        }),
        this.db.user.count({
          where: whereCondition,
        }),
      ]);

      const metadata = {
        totalDocuments,
        currentPage: page ? parseInt(page) : 1,
        totalPage: Math.ceil(totalDocuments / take),
        limit: take,
      };

      return { data: users, metadata };
    } catch (error) {
      this.logger.error(error);
      return { data: [], metadata: null };
    }
  }

  async findById(id: string): Promise<User> {
    try {
      const user = await this.db.user.findUnique({
        where: {
          id,
        },
      });
      return user;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      const user = await this.db.user.findUnique({
        where: {
          email: email.toLowerCase(),
        },
      });
      return user;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async update(id: string, data: UpdateUserDto): Promise<User> {
    try {
      const user = await this.db.user.update({
        where: {
          id,
        },
        data,
      });
      return user;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async delete(id: string): Promise<User> {
    try {
      const user = await this.db.user.delete({
        where: {
          id,
        },
      });
      return user;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }
}
