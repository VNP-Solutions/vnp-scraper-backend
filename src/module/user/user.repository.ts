import { User } from './../../../node_modules/.prisma/client/index.d';
import { Injectable, Logger } from '@nestjs/common';
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

  async findAllByQuery(query: string): Promise<User[]> {
    try {
      const users = await this.db.user.findMany({
        where: {
          OR: [
            {
              name: {
                contains: query,
              },
            },
            {
              email: {
                contains: query,
              },
            },
          ],
        },
      });
      return users;
    } catch (error) {
      this.logger.error(error);
      return null;
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
