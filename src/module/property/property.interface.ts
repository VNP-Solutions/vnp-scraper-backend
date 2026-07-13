import { OTAProvider, Property } from '@prisma/client';
import { CreatePropertyDto, SyncBulkUpsertPropertyItemDto, SyncBulkUpsertPropertyResultDto, SyncDeleteDto, UpdatePropertyDto } from './property.dto';
import type {
  RevealOtaCredentialsBody,
  UpdateOtaCredentialsBody,
} from './property.validation';

export interface PropertyDropdownItem {
  id: string;
  name: string;
  portfolio_id: string | null;
}

export interface IPropertyRepository {
  create(data: CreatePropertyDto): Promise<Property>;
  findAll(
    query?: Record<string, any>,
  ): Promise<{ properties: Property[]; metadata: any }>;
  findById(id: string): Promise<Property>;
  findByExpediaId(expediaId: number): Promise<Property | null>;
  findByAgodaId(agodaId: number): Promise<Property | null>;
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
  ): Promise<PropertyDropdownItem[]>;
  // Portfolio operations
  findPortfolioByName(name: string): Promise<any>;
  createPortfolio(name: string): Promise<any>;
  // Sub-portfolio operations
  findSubPortfolioByNameAndPortfolio(
    name: string,
    portfolioId: string,
  ): Promise<any>;
  createSubPortfolio(name: string, portfolioId: string): Promise<any>;
  // Property operations for import
  findPropertyByNameAndRelations(
    name: string,
    portfolioId?: string,
    subPortfolioId?: string,
  ): Promise<any>;
  // Property credentials operations
  createPropertyCredentials(
    propertyId: string,
    credentialsData: any,
  ): Promise<any>;
  updatePropertyCredentials(
    propertyId: string,
    credentialsData: any,
  ): Promise<any>;
  mergePropertyCredentials(
    propertyId: string,
    credentialsData: any,
  ): Promise<any>;
  findPropertyCredentialsByPropertyId(propertyId: string): Promise<any>;
  // Excel import operations
  importPropertiesFromExcel(file: Express.Multer.File): Promise<{
    portfoliosCreated: number;
    subPortfoliosCreated: number;
    propertiesCreated: number;
    credentialsCreated: number;
    portfolios: any[];
    subPortfolios: any[];
    properties: any[];
  }>;
  importExpediaCredentialsFromExcel(file: Express.Multer.File): Promise<{
    updated: number;
    propertyNotFound: number;
    rowsSkippedInvalid: number;
    failures: Array<{ row: number; expediaId?: number; reason: string }>;
  }>;
  updateOtaCredentials(
    body: UpdateOtaCredentialsBody,
  ): Promise<{
    updated: number;
    propertyNotFound: boolean;
    failures: Array<{ reason: string; property_id?: string }>;
  }>;
  getOtaCredentialsReveal(
    propertyId: string,
    otaProvider: OTAProvider,
  ): Promise<{
    propertyNotFound: boolean;
    credentialsNotFound: boolean;
    username: string;
    password: string;
  }>;
  findByOtaIds(ids: { expedia_id: number | null; booking_id: number | null; agoda_id: number | null }): Promise<Property | null>
  findByName(name: string): Promise<Property | null>
  findByParentId(parentId: string): Promise<Property | null>
  findPortfolioByParentId(parentId: string): Promise<any>
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
  ): Promise<PropertyDropdownItem[]>;
  // getPropertyCredentials(propertyId: string): Promise<any>;
  importPropertiesFromExcel(file: Express.Multer.File): Promise<{
    portfoliosCreated: number;
    subPortfoliosCreated: number;
    propertiesCreated: number;
    credentialsCreated: number;
    portfolios: any[];
    subPortfolios: any[];
    properties: any[];
  }>;
  importExpediaCredentialsFromExcel(file: Express.Multer.File): Promise<{
    updated: number;
    propertyNotFound: number;
    rowsSkippedInvalid: number;
    failures: Array<{ row: number; expediaId?: number; reason: string }>;
  }>;
  updateOtaCredentials(
    body: UpdateOtaCredentialsBody,
  ): Promise<{
    updated: number;
    propertyNotFound: boolean;
    failures: Array<{ reason: string; property_id?: string }>;
  }>;
  getOtaCredentialsReveal(
    body: RevealOtaCredentialsBody,
  ): Promise<{
    propertyNotFound: boolean;
    credentialsNotFound: boolean;
    username: string;
    password: string;
  }>;

  /** Flattens `credentials[]` to a single object like GET /properties. */
  applyPropertyCredentialsShape(property: any | null | undefined): void;
  syncCreate(dto: CreatePropertyDto): Promise<{ status: string; id?: string }>
  syncDelete(dto: SyncDeleteDto): Promise<{ status: string; id?: string }>
  syncBulkCreate(items: CreatePropertyDto[]): Promise<{
    created: number; alreadyExists: number; failed: number;
    results: Array<{ name: string; status: string; id?: string }>;
  }>;
  syncBulkUpsert(
    items: SyncBulkUpsertPropertyItemDto[],
  ): Promise<SyncBulkUpsertPropertyResultDto>;
  
}
