import { Portfolio } from '@prisma/client';
import {
  CreatePortfolioDto,
  SyncCreatePortfolioDto,
  SyncUpdatePortfolioDto,
  SyncDeletePortfolioDto,
  UpdatePortfolioDto,
} from './portfolio.dto';

export interface IPortfolioRepository {
  create(
    data: CreatePortfolioDto,
    auditUserId: string,
    documentId?: string,
  ): Promise<Portfolio>;
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
  reassignPropertiesToPortfolio(
    fromPortfolioId: string,
    toPortfolioId: string,
  ): Promise<number>;
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
  syncCreate(
    dto: SyncCreatePortfolioDto,
  ): Promise<{ status: string; id?: string }>;
  syncUpdate(
    dto: SyncUpdatePortfolioDto,
  ): Promise<{ status: string; id?: string }>;
  syncDelete(
    dto: SyncDeletePortfolioDto,
  ): Promise<{ status: string; id?: string; movedProperties?: number }>;
}
