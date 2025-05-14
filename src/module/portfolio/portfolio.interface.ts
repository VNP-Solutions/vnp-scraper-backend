import { Portfolio } from '@prisma/client';
import { CreatePortfolioDto, UpdatePortfolioDto } from './portfolio.dto';

export interface IPortfolioRepository {
  create(data: CreatePortfolioDto): Promise<Portfolio>;
  findAll(name?: string): Promise<Portfolio[]>;
  findById(id: string): Promise<Portfolio>;
  update(id: string, data: UpdatePortfolioDto): Promise<Portfolio>;
  delete(id: string): Promise<Portfolio>;
}

export interface IPortfolioService {
  createPortfolio(data: CreatePortfolioDto): Promise<Portfolio>;
  getAllPortfolios(name?: string): Promise<Portfolio[]>;
  getPortfolioById(id: string): Promise<Portfolio>;
  updatePortfolio(id: string, data: UpdatePortfolioDto): Promise<Portfolio>;
  deletePortfolio(id: string): Promise<Portfolio>;
}
