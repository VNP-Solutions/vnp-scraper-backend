import { Property } from '@prisma/client';
import { CreatePropertyDto, UpdatePropertyDto } from './property.dto';

export interface IPropertyRepository {
  create(data: CreatePropertyDto): Promise<Property>;
  findAll(): Promise<Property[]>;
  findById(id: string): Promise<Property>;
  update(id: string, data: UpdatePropertyDto): Promise<Property>;
  delete(id: string): Promise<Property>;
}

export interface IPropertyService {
  createProperty(data: CreatePropertyDto): Promise<Property>;
  getAllProperties(): Promise<Property[]>;
  getPropertyById(id: string): Promise<Property>;
  updateProperty(id: string, data: UpdatePropertyDto): Promise<Property>;
  deleteProperty(id: string): Promise<Property>;
}
