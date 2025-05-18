import { PropertyCredentials } from '@prisma/client';
import {
  CreatePropertyCredentialsDto,
  UpdatePropertyCredentialsDto,
} from './property-credentials.dto';

export interface IPropertyCredentialsRepository {
  create(data: CreatePropertyCredentialsDto): Promise<PropertyCredentials>;
  findAll(): Promise<PropertyCredentials[]>;
  findById(id: string): Promise<PropertyCredentials>;
  update(
    id: string,
    data: UpdatePropertyCredentialsDto,
  ): Promise<PropertyCredentials>;
  delete(id: string): Promise<PropertyCredentials>;
  updateProperty(id: string, data: any): Promise<any>;
}

export interface IPropertyCredentialsService {
  createPropertyCredentials(
    data: CreatePropertyCredentialsDto,
  ): Promise<PropertyCredentials>;
  getAllPropertyCredentials(): Promise<PropertyCredentials[]>;
  getPropertyCredentialsById(id: string): Promise<PropertyCredentials>;
  updatePropertyCredentials(
    id: string,
    data: UpdatePropertyCredentialsDto,
  ): Promise<PropertyCredentials>;
  deletePropertyCredentials(id: string): Promise<PropertyCredentials>;
}
