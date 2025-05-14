import { SubPortfolio } from '@prisma/client';
import { CreateSubPortfolioDto, UpdateSubPortfolioDto } from './sub-portfolio.dto';

export interface ISubPortfolioRepository {
  create(data: CreateSubPortfolioDto): Promise<SubPortfolio>;
  findById(id: string): Promise<SubPortfolio>;
  findAll(query: string): Promise<SubPortfolio[]>;
  update(id: string, data: UpdateSubPortfolioDto): Promise<SubPortfolio>;
  delete(id: string): Promise<SubPortfolio>;
  findByPortfolioId(portfolioId: string): Promise<SubPortfolio[]>;
}

export interface ISubPortfolioService {
  createSubPortfolio(data: CreateSubPortfolioDto): Promise<SubPortfolio>;
  getSubPortfolioById(id: string): Promise<SubPortfolio>;
  getAllSubPortfolios(query: string): Promise<SubPortfolio[]>;
  updateSubPortfolio(id: string, data: UpdateSubPortfolioDto): Promise<SubPortfolio>;
  deleteSubPortfolio(id: string): Promise<SubPortfolio>;
  findSubPortfoliosByPortfolioId(portfolioId: string): Promise<SubPortfolio[]>;
}