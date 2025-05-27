import { User } from '@prisma/client';
import { CreateUserDto, UpdateUserDto } from './user.dto';

export interface IUserRepository {
  create(data: CreateUserDto): Promise<User>;
  findAllByQuery(
    query: Record<string, any>,
  ): Promise<{ data: User[]; metadata: any }>;
  findById(id: string): Promise<User>;
  update(id: string, data: UpdateUserDto): Promise<User>;
  delete(id: string): Promise<User>;
}

export interface IUserService {
  createUser(data: CreateUserDto): Promise<User>;
  getAllUsers(
    query: Record<string, any>,
  ): Promise<{ data: User[]; metadata: any }>;
  getUserById(id: string): Promise<User>;
  updateUser(id: string, data: UpdateUserDto): Promise<User>;
  deleteUser(id: string): Promise<User>;
}
