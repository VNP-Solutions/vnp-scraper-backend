import { CreateUserDto, UpdateUserDto } from './user.dto';
import { User } from '@prisma/client';

export interface IUserRepository {
  create(data: CreateUserDto): Promise<User>;
  findAllByQuery(query: string): Promise<User[]>;
  findById(id: string): Promise<User>;
  update(id: string, data: UpdateUserDto): Promise<User>;
  delete(id: string): Promise<User>;
}

export interface IUserService {
  createUser(data: CreateUserDto): Promise<User>;
  getAllUsers(query: string): Promise<User[]>;
  getUserById(id: string): Promise<User>;
  updateUser(id: string, data: UpdateUserDto): Promise<User>;
  deleteUser(id: string): Promise<User>;
}
