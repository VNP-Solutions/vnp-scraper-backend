import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';
import { CreateUserDto, UpdateUserDto } from './user.dto';
import { IUserRepository, IUserService } from './user.interface';

@Injectable()
export class UserService implements IUserService {
  constructor(
    @Inject('IUserRepository')
    private readonly repository: IUserRepository,
    private readonly logger: Logger,
  ) {}

  async createUser(data: CreateUserDto): Promise<User> {
    try {
      const user = await this.repository.create(data);
      return user;
    } catch (error) {
      this.logger.error(`Error creating user: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getAllUsers(
    query: Record<string, any>,
  ): Promise<{ data: User[]; metadata: any }> {
    try {
      const result = await this.repository.findAllByQuery(query);
      return result;
    } catch (error) {
      this.logger.error(`Error searching users: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getUserById(id: string): Promise<User> {
    try {
      const user = await this.repository.findById(id);
      if (!user) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }
      return user;
    } catch (error) {
      this.logger.error(`Error finding user: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateUser(id: string, data: UpdateUserDto): Promise<User> {
    try {
      const user = await this.repository.update(id, data);
      return user;
    } catch (error) {
      this.logger.error(`Error updating user: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteUser(id: string): Promise<any> {
    try {
      await this.repository.delete(id);
    } catch (error) {
      this.logger.error(`Error deleting user: ${error.message}`, error.stack);
      throw error;
    }
  }
}
