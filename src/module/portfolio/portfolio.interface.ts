import { Portfolio } from '@prisma/client';
import { CreatePortfolioDto, UpdatePortfolioDto } from './portfolio.dto';

export interface IPortfolioRepository {
  create(data: CreatePortfolioDto, id: string): Promise<Portfolio>;
  findAll(
    query?: Record<string, any>,
  ): Promise<{ data: Portfolio[]; metadata: any }>;
  findById(id: string): Promise<Portfolio>;
  update(
    id: string,
    data: UpdatePortfolioDto,
    userId: string,
  ): Promise<Portfolio>;
  delete(id: string): Promise<Portfolio>;
  findFilteredPortfolio(
    userId: string,
  ): Promise<{ data: Portfolio[]; metadata: any }>;
  findPermission(id: string, userId: string): Promise<any>;
}

export interface IPortfolioService {
  createPortfolio(data: CreatePortfolioDto, id: string): Promise<Portfolio>;
  getAllPortfolios(
    query?: Record<string, any>,
  ): Promise<{ data: Portfolio[]; metadata: any }>;
  getPortfolioById(id: string): Promise<Portfolio>;
  updatePortfolio(
    id: string,
    data: UpdatePortfolioDto,
    userId: string,
  ): Promise<Portfolio>;
  deletePortfolio(id: string): Promise<Portfolio>;
  getFilteredPortfolio(
    userId: string,
  ): Promise<{ data: Portfolio[]; metadata: any }>;
  getPermission(id: string, userId: string): Promise<any>;
}
