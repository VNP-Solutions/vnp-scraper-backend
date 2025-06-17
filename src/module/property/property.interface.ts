import { Property } from '@prisma/client';
import { CreatePropertyDto, UpdatePropertyDto } from './property.dto';

export interface IPropertyRepository {
  create(data: CreatePropertyDto): Promise<Property>;
  findAll(
    query?: Record<string, any>,
  ): Promise<{ properties: Property[]; metadata: any }>;
  findById(id: string): Promise<Property>;
  update(id: string, data: UpdatePropertyDto): Promise<Property>;
  delete(id: string): Promise<Property>;
  findFilteredProperty(
    userId: string,
    query?: Record<string, any>,
  ): Promise<{ properties: Property[]; metadata: any }>;
  getPermissionByPortfolioId(portfolioId: string, userId: string): Promise<any>;
  getPermissionBySubPortfolioId(
    subPortfolioId: string,
    userId: string,
  ): Promise<any>;
  findPropertyByPortfolioId(portfolioId: string): Promise<any>;
  findPropertyBySubPortfolioId(subPortfolioId: string): Promise<any>;
  getPermission(id: string, userId: string): Promise<any>;
  findPortfolioAndSubPortfolioForDropdown(user: any): Promise<any>;
  findAllByUserPermission(
    userId: string,
    isAdmin: boolean,
  ): Promise<Property[]>;
}

export interface IPropertyService {
  createProperty(data: CreatePropertyDto): Promise<Property>;
  getAllProperties(
    query?: Record<string, any>,
  ): Promise<{ properties: Property[]; metadata: any }>;
  getPropertyById(id: string): Promise<Property>;
  updateProperty(id: string, data: UpdatePropertyDto): Promise<Property>;
  deleteProperty(id: string): Promise<Property>;
  getPermission(id: string, userId: string): Promise<any>;
  getFilteredProperty(
    userId: string,
    query?: Record<string, any>,
  ): Promise<{ properties: Property[]; metadata: any }>;
  getPermissionByPortfolioId(portfolioId: string, userId: string): Promise<any>;
  getPermissionBySubPortfolioId(
    subPortfolioId: string,
    userId: string,
  ): Promise<any>;
  getPropertyByPortfolioId(portfolioId: string): Promise<any>;
  getPropertyBySubPortfolioId(subPortfolioId: string): Promise<any>;
  getPermission(id: string, userId: string): Promise<any>;
  findPortfolioAndSubPortfolioForDropdown(user: any): Promise<any>;
  getAllPropertiesByUserPermission(
    userId: string,
    isAdmin: boolean,
  ): Promise<Property[]>;
}
