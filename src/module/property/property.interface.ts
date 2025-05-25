import { Property } from '@prisma/client';
import { CreatePropertyDto, UpdatePropertyDto } from './property.dto';

export interface IPropertyRepository {
  create(data: CreatePropertyDto): Promise<Property>;
  findAll(): Promise<Property[]>;
  findById(id: string): Promise<Property>;
  update(id: string, data: UpdatePropertyDto): Promise<Property>;
  delete(id: string): Promise<Property>;
  findPermission(id: string, userId: string): Promise<any>;
  findFilteredProperty(userId: string): Promise<any>;
  getPermissionByPortfolioId(portfolioId: string, userId: string): Promise<any>;
  getPermissionBySubPortfolioId(subPortfolioId: string, userId: string): Promise<any>;
  findPropertyByPortfolioId(portfolioId: string): Promise<any>;
  findPropertyBySubPortfolioId(subPortfolioId: string): Promise<any>;
}

export interface IPropertyService {
  createProperty(data: CreatePropertyDto): Promise<Property>;
  getAllProperties(): Promise<Property[]>;
  getPropertyById(id: string): Promise<Property>;
  updateProperty(id: string, data: UpdatePropertyDto): Promise<Property>;
  deleteProperty(id: string): Promise<Property>;
  getPermission(id: string, userId: string): Promise<any>;
  getFilteredProperty(userId: string): Promise<any>;
  getPermissionByPortfolioId(portfolioId: string, userId: string): Promise<any>;
  getPermissionBySubPortfolioId(subPortfolioId: string, userId: string): Promise<any>;
  getPropertyByPortfolioId(portfolioId: string): Promise<any>;
  getPropertyBySubPortfolioId(subPortfolioId: string): Promise<any>;
}
