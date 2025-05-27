import { Injectable, Logger } from '@nestjs/common';
import { Property } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { CreatePropertyDto, UpdatePropertyDto } from './property.dto';
import { IPropertyRepository } from './property.interface';

@Injectable()
export class PropertyRepository implements IPropertyRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  get databaseService(): DatabaseService {
    return this.db;
  }

  async create(data: CreatePropertyDto): Promise<Property> {
    try {
      const property = await this.db.property.create({
        data,
      });
      return property;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findAll(
    query?: Record<string, any>,
  ): Promise<{ properties: Property[]; metadata: any }> {
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

      let allFilters = { ...filters };
      if (search) {
        allFilters = {
          ...allFilters,
          AND: [
            {
              name: {
                contains: search,
                mode: 'insensitive',
              },
            },
          ],
        };
      }

      if (start_date && end_date) {
        allFilters = {
          ...allFilters,
          createdAt: {
            gte: new Date(start_date),
            lte: new Date(end_date),
          },
        };
      }

      const [properties, totalDocuments] = await Promise.all([
        this.db.property.findMany({
          skip,
          take,
          orderBy,
          where: allFilters,
          include: {
            credentials: true,
          },
        }),
        this.db.property.count({
          where: allFilters,
        }),
      ]);

      const metadata = {
        totalDocuments,
        currentPage: page ? parseInt(page) : 1,
        totalPage: Math.ceil(totalDocuments / take),
        limit: take,
      };

      return { properties, metadata };
    } catch (error) {
      this.logger.error(error);
      return { properties: [], metadata: null };
    }
  }

  async findById(id: string): Promise<Property> {
    try {
      const property = await this.db.property.findUnique({
        where: {
          id,
        },
        include: {
          credentials: true,
        },
      });
      return property;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async update(id: string, data: UpdatePropertyDto): Promise<Property> {
    try {
      const property = await this.db.property.update({
        where: {
          id,
        },
        data,
        include: {
          credentials: true,
        },
      });
      return property;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async delete(id: string): Promise<Property> {
    try {
      const property = await this.db.property.delete({
        where: {
          id,
        },
        include: {
          credentials: true,
        },
      });
      return property;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findPermission(id: string, userId: string): Promise<any> {
    return this.db.userFeatureAccessPermission.findFirst({
      where: {
        user_id: userId,
        property_id: id,
      },
    });
  }

  async findFilteredProperty(
    userId: string,
    query?: Record<string, any>,
  ): Promise<{ properties: Property[]; metadata: any }> {
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

      let whereCondition: any = {
        userFeatureAccessPermissions: {
          some: {
            user_id: userId,
          },
        },
      };

      // Add search functionality
      if (search) {
        whereCondition = {
          ...whereCondition,
          name: {
            contains: search,
            mode: 'insensitive',
          },
        };
      }

      // Add date range filtering
      if (start_date && end_date) {
        whereCondition = {
          ...whereCondition,
          createdAt: {
            gte: new Date(start_date),
            lte: new Date(end_date),
          },
        };
      }

      // Add additional filters
      if (Object.keys(filters).length > 0) {
        whereCondition = {
          ...whereCondition,
          ...filters,
        };
      }

      const [properties, totalDocuments] = await Promise.all([
        this.db.property.findMany({
          skip,
          take,
          orderBy,
          where: whereCondition,
          include: {
            credentials: true,
          },
        }),
        this.db.property.count({
          where: whereCondition,
        }),
      ]);

      const metadata = {
        totalDocuments,
        currentPage: page ? parseInt(page) : 1,
        totalPage: Math.ceil(totalDocuments / take),
        limit: take,
      };

      return { properties, metadata };
    } catch (error) {
      this.logger.error(error);
      return { properties: [], metadata: null };
    }
  }

  async getPermissionByPortfolioId(
    portfolioId: string,
    userId: string,
  ): Promise<any> {
    return this.db.userFeatureAccessPermission.findFirst({
      where: {
        user_id: userId,
        portfolio_id: portfolioId,
      },
    });
  }

  async getPermissionBySubPortfolioId(
    subPortfolioId: string,
    userId: string,
  ): Promise<any> {
    return this.db.userFeatureAccessPermission.findFirst({
      where: {
        user_id: userId,
        sub_portfolio_id: subPortfolioId,
      },
    });
  }

  async findPropertyByPortfolioId(portfolioId: string): Promise<any> {
    try {
      return this.db.property.findMany({
        where: {
          OR: [
            { portfolio_id: portfolioId },
            {
              subPortfolio: {
                portfolio_id: portfolioId,
              },
            },
          ],
        },
        include: {
          subPortfolio: true,
          credentials: true,
        },
      });
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findPropertyBySubPortfolioId(subPortfolioId: string): Promise<any> {
    return this.db.property.findMany({
      where: {
        sub_portfolio_id: subPortfolioId,
      },
      include: {
        credentials: true,
      },
    });
  }
}
