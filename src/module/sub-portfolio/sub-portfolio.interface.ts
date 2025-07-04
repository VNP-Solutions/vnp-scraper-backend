import { SubPortfolio } from '@prisma/client';
import {
  CreateSubPortfolioDto,
  UpdateSubPortfolioDto,
} from './sub-portfolio.dto';

export interface ISubPortfolioRepository {
  create(data: CreateSubPortfolioDto): Promise<SubPortfolio>;
  findById(id: string): Promise<SubPortfolio>;
  findAll(
    query: Record<string, any>,
  ): Promise<{ data: SubPortfolio[]; metadata: any }>;
  update(id: string, data: UpdateSubPortfolioDto): Promise<SubPortfolio>;
  delete(id: string): Promise<SubPortfolio>;
  findByPortfolioId(portfolioId: string): Promise<SubPortfolio[]>;
  getPermission(id: string, userId: string): Promise<any>;
  findFilteredSubPortfolios(
    userId: string,
    query?: Record<string, any>,
  ): Promise<{ data: SubPortfolio[]; metadata: any }>;
  getPermissionByPortfolioId(portfolioId: string, userId: string): Promise<any>;
}

export interface ISubPortfolioService {
  createSubPortfolio(data: CreateSubPortfolioDto): Promise<SubPortfolio>;
  getSubPortfolioById(id: string): Promise<SubPortfolio>;
  getAllSubPortfolios(query: Record<string, any>): Promise<{ data: SubPortfolio[]; metadata: any }>;
  updateSubPortfolio(
    id: string,
    data: UpdateSubPortfolioDto,
  ): Promise<SubPortfolio>;
  deleteSubPortfolio(id: string): Promise<SubPortfolio>;
  findSubPortfoliosByPortfolioId(portfolioId: string): Promise<SubPortfolio[]>;
  getPermission(id: string, userId: string): Promise<any>;
  getFilteredSubPortfolios(
    userId: string,
    query?: Record<string, any>,
  ): Promise<{ data: SubPortfolio[]; metadata: any }>;
  getPermissionByPortfolioId(portfolioId: string, userId: string): Promise<any>;
}
