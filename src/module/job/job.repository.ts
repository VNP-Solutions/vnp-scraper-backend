import { Injectable, Logger } from '@nestjs/common';
import { Job, Prisma } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { CreateJobDto, UpdateJobDto } from './job.dto';
import { IJobRepository } from './job.interface';

@Injectable()
export class JobRepository implements IJobRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  async create(data: CreateJobDto): Promise<Job> {
    try {
      const { property_id, user_id, portfolio_id, sub_portfolio_id, ...rest } =
        data;

      const propertyData = await this.db.property.findFirst({
        where: {
          id: property_id,
        },
        include: {
          portfolio: true,
          subPortfolio: true,
        },
      });

      const jobData: Prisma.JobCreateInput = {
        ...rest,
        next_due_date: data.next_due_date || null,
        property_name: data.property_name,
        billing_type: data.billing_type || '',
        user: { connect: { id: user_id } },
        property: property_id ? { connect: { id: property_id } } : undefined,
        portfolio_name:
          propertyData?.portfolio?.name || data.portfolio_name || '',
        sub_portfolio_name:
          propertyData?.subPortfolio?.name || data.sub_portfolio_name || '',
        watcher_emails: data.watcher_emails || [],
        // Use portfolio_id from data if available, otherwise use from property relationship
        portfolio:
          portfolio_id || propertyData?.portfolio?.id
            ? { connect: { id: portfolio_id || propertyData?.portfolio?.id } }
            : undefined,
        subPortfolio:
          sub_portfolio_id || propertyData?.subPortfolio?.id
            ? {
                connect: {
                  id: sub_portfolio_id || propertyData?.subPortfolio?.id,
                },
              }
            : undefined,
      };

      const job = await this.db.job.create({
        data: jobData,
      });
      return job;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findById(id: string): Promise<Job> {
    try {
      const job = await this.db.job.findUnique({
        where: { id },
      });
      return job;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findAll(
    query: Record<string, any>,
  ): Promise<{ data: Job[]; metadata: any }> {
    try {
      const {
        page,
        limit,
        sortBy,
        sortOrder,
        search,
        start_date,
        end_date,
        ...filters
      } = query || {};
      let allFilters: any = { ...filters };

      if (search) {
        // Convert search term to string and check if it's numeric for ID searches
        const searchTerm = search.toString().trim();
        const isNumeric = !isNaN(Number(searchTerm));

        // Check if search term is a valid MongoDB ObjectId (24 character hex string)
        const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(searchTerm);

        allFilters.OR = [
          // Job fields - only search by ID if it's a valid ObjectId format
          ...(isValidObjectId ? [{ id: searchTerm }] : []),
          { name: { contains: searchTerm, mode: 'insensitive' } },

          // Portfolio/Sub-portfolio/Property names (existing)
          { portfolio_name: { contains: searchTerm, mode: 'insensitive' } },
          { sub_portfolio_name: { contains: searchTerm, mode: 'insensitive' } },
          { property_name: { contains: searchTerm, mode: 'insensitive' } },

          // Property IDs through relationship (only search if numeric)
          ...(isNumeric
            ? [
                { property: { expedia_id: parseInt(searchTerm) } },
                { property: { booking_id: parseInt(searchTerm) } },
                { property: { agoda_id: parseInt(searchTerm) } },
              ]
            : []),
        ];
      }

      if (start_date && end_date) {
        allFilters.createdAt = {
          gte: new Date(start_date),
          lte: new Date(end_date),
        };
      }

      const skip = page
        ? (parseInt(page || '1') - 1) * parseInt(limit || '10')
        : 0;
      const take = limit ? parseInt(limit) : 10;
      let orderBy = undefined;
      if (sortBy) {
        orderBy = {
          [sortBy]: sortOrder?.toLowerCase() === 'desc' ? 'desc' : 'asc',
        };
      }

      // Include property relationship for searching and data completeness
      const include = {
        property: {
          select: {
            id: true,
            name: true,
            expedia_id: true,
            booking_id: true,
            agoda_id: true,
          },
        },
        portfolio: {
          select: {
            id: true,
            name: true,
          },
        },
        subPortfolio: {
          select: {
            id: true,
            name: true,
          },
        },
      };

      const totalDocuments = await this.db.job.count({
        where: allFilters,
      });

      const jobs = await this.db.job.findMany({
        where: allFilters,
        include,
        skip,
        take,
        orderBy,
      });

      const metadata = {
        totalDocuments,
        currentPage: parseInt(page),
        totalPage: Math.ceil(totalDocuments / parseInt(limit)),
        limit: parseInt(limit),
      };
      return { data: jobs, metadata };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async update(id: string, data: UpdateJobDto): Promise<Job> {
    try {
      const job = await this.db.job.update({
        where: { id },
        data,
      });
      return job;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async delete(id: string): Promise<Job> {
    try {
      const job = await this.db.job.delete({
        where: { id },
      });
      return job;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findPortfolioByName(name: string): Promise<any> {
    try {
      const portfolio = await this.db.portfolio.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      return portfolio;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findSubPortfolioByNameAndPortfolio(
    name: string,
    portfolioId: string,
  ): Promise<any> {
    try {
      const subPortfolio = await this.db.subPortfolio.findFirst({
        where: {
          name: { equals: name, mode: 'insensitive' },
          portfolio_id: portfolioId,
        },
      });
      return subPortfolio;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findPropertyByNameAndRelations(
    name: string,
    portfolioId?: string,
    subPortfolioId?: string,
  ): Promise<any> {
    try {
      const whereClause: any = {
        //name: { equals: name, mode: 'insensitive' },
        name: name,
      };

      if (portfolioId) {
        whereClause.portfolio_id = portfolioId;
      }

      if (subPortfolioId) {
        whereClause.sub_portfolio_id = subPortfolioId;
      }

      const property = await this.db.property.findFirst({
        where: whereClause,
      });
      return property;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findLatestCheckoutDateByJobId(
    jobId: string,
  ): Promise<{ check_out_date: Date } | null> {
    try {
      const latestJobItem = await this.db.jobItem.findFirst({
        where: {
          job_id: jobId,
        },
        orderBy: {
          check_out_date: 'desc',
        },
        select: {
          check_out_date: true,
        },
      });
      return latestJobItem;
    } catch (error) {
      this.logger.error(
        `Error finding latest checkout date for job ${jobId}:`,
        error,
      );
      throw error;
    }
  }
}
