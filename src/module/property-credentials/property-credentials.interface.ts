import { PropertyCredentials } from '@prisma/client';
import {
  BulkUpdatePropertyCredentialsDto,
  CreatePropertyCredentialsDto,
  UpdatePropertyCredentialsDto,
} from './property-credentials.dto';

export interface IPropertyCredentialsRepository {
  create(data: CreatePropertyCredentialsDto): Promise<PropertyCredentials>;
  findAll(): Promise<PropertyCredentials[]>;
  findById(id: string): Promise<PropertyCredentials>;
  findByPropertyId(propertyId: string): Promise<PropertyCredentials | null>;
  update(
    id: string,
    data: UpdatePropertyCredentialsDto,
  ): Promise<PropertyCredentials>;
  delete(id: string): Promise<PropertyCredentials>;
  updateProperty(id: string, data: any): Promise<any>;
  bulkUpdate(
    data: BulkUpdatePropertyCredentialsDto,
  ): Promise<{ success: PropertyCredentials[]; failed: any[] }>;
}

export interface IPropertyCredentialsService {
  createPropertyCredentials(
    data: CreatePropertyCredentialsDto,
  ): Promise<PropertyCredentials>;
  getAllPropertyCredentials(): Promise<PropertyCredentials[]>;
  getPropertyCredentialsById(id: string): Promise<PropertyCredentials>;
  getPropertyCredentialsByPropertyId(
    propertyId: string,
  ): Promise<PropertyCredentials | null>;
  updatePropertyCredentials(
    id: string,
    data: UpdatePropertyCredentialsDto,
  ): Promise<PropertyCredentials>;
  deletePropertyCredentials(id: string): Promise<PropertyCredentials>;
  bulkUpdatePropertyCredentials(
    data: BulkUpdatePropertyCredentialsDto,
  ): Promise<{ success: PropertyCredentials[]; failed: any[] }>;
  decryptPassword(encryptedPassword: string): string;
}
