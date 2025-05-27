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
            portfolio: true,
            subPortfolio: {
              include: {
                portfolio: true,
              },
            },
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

      // Get all accessible property IDs using separate queries
      const accessiblePropertyIds = new Set<string>();

      // 1. Direct property access
      const directAccess = await this.db.userFeatureAccessPermission.findMany({
        where: {
          user_id: userId,
          property_id: { not: null },
        },
        select: { property_id: true },
      });
      directAccess.forEach((perm) => {
        if (perm.property_id) accessiblePropertyIds.add(perm.property_id);
      });

      // 2. Portfolio access
      const portfolioAccess =
        await this.db.userFeatureAccessPermission.findMany({
          where: {
            user_id: userId,
            portfolio_id: { not: null },
          },
          select: { portfolio_id: true },
        });

      if (portfolioAccess.length > 0) {
        const portfolioIds = portfolioAccess
          .map((p) => p.portfolio_id)
          .filter(Boolean);
        const portfolioProperties = await this.db.property.findMany({
          where: {
            OR: [
              { portfolio_id: { in: portfolioIds } },
              { subPortfolio: { portfolio_id: { in: portfolioIds } } },
            ],
          },
          select: { id: true },
        });
        portfolioProperties.forEach((prop) =>
          accessiblePropertyIds.add(prop.id),
        );
      }

      // 3. Sub-portfolio access
      const subPortfolioAccess =
        await this.db.userFeatureAccessPermission.findMany({
          where: {
            user_id: userId,
            sub_portfolio_id: { not: null },
          },
          select: { sub_portfolio_id: true },
        });

      if (subPortfolioAccess.length > 0) {
        const subPortfolioIds = subPortfolioAccess
          .map((p) => p.sub_portfolio_id)
          .filter(Boolean);
        const subPortfolioProperties = await this.db.property.findMany({
          where: {
            sub_portfolio_id: { in: subPortfolioIds },
          },
          select: { id: true },
        });
        subPortfolioProperties.forEach((prop) =>
          accessiblePropertyIds.add(prop.id),
        );
      }

      // Convert Set to Array for Prisma query
      const accessiblePropertyIdsArray = Array.from(accessiblePropertyIds);

      let whereCondition: any = {
        id: { in: accessiblePropertyIdsArray },
      };

      // Build additional conditions array
      const additionalConditions = [];

      // Add search functionality
      if (search) {
        additionalConditions.push({
          name: {
            contains: search,
            mode: 'insensitive',
          },
        });
      }

      // Add date range filtering
      if (start_date && end_date) {
        additionalConditions.push({
          createdAt: {
            gte: new Date(start_date),
            lte: new Date(end_date),
          },
        });
      }

      // Add additional filters
      if (Object.keys(filters).length > 0) {
        Object.entries(filters).forEach(([key, value]) => {
          additionalConditions.push({
            [key]: value,
          });
        });
      }

      // Combine base condition with additional conditions
      if (additionalConditions.length > 0) {
        whereCondition = {
          AND: [whereCondition, ...additionalConditions],
        };
      }

      // If no accessible properties, return empty result
      if (accessiblePropertyIdsArray.length === 0) {
        return {
          properties: [],
          metadata: {
            totalDocuments: 0,
            currentPage: page ? parseInt(page) : 1,
            totalPage: 0,
            limit: take,
          },
        };
      }

      // Count total documents after applying search and filters
      let countWhereCondition = { ...whereCondition };
      if (additionalConditions.length > 0) {
        countWhereCondition = {
          AND: [countWhereCondition, ...additionalConditions],
        };
      }

      const totalDocuments = await this.db.property.count({
        where: countWhereCondition,
      });

      // Apply search and filters to the final query
      if (additionalConditions.length > 0) {
        whereCondition = {
          AND: [whereCondition, ...additionalConditions],
        };
      }

      // Then get the paginated results
      const properties = await this.db.property.findMany({
        skip,
        take,
        orderBy,
        where: whereCondition,
        include: {
          credentials: true,
          portfolio: true,
          subPortfolio: {
            include: {
              portfolio: true,
            },
          },
        },
      });

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
