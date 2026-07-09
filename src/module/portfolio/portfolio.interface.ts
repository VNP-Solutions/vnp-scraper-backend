import { Portfolio } from '@prisma/client';
import { CreatePortfolioDto, UpdatePortfolioDto, UpsertPortfolioDto } from './portfolio.dto';

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
  findByName(name: string): Promise<Portfolio | null>;
  ensureInternalPortfolio(): Promise<Portfolio>;
  reassignPropertiesToPortfolio(fromPortfolioId: string, toPortfolioId: string): Promise<number>;
  findByParentId(parentId: string): Promise<Portfolio | null>;
  upsertByParentId(
    parentId: string,
    data: UpsertPortfolioDto,
    actor: string,
  ): Promise<Portfolio>;
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
  syncCreate(name: string): Promise<{ status: string; id?: string }>;
  syncUpdate(oldName: string, newName: string): Promise<{ status: string; id?: string }>;
  syncDelete(name: string): Promise<{ status: string; id?: string; movedProperties?: number }>;
  upsertPortfolioByParentId(
    parentId: string,
    data: UpsertPortfolioDto,
  ): Promise<Portfolio>;
}
