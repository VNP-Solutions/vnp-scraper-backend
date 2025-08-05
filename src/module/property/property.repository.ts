import { Injectable, Logger } from '@nestjs/common';
import { Property, RoleEnum } from '@prisma/client';
import { EncryptionUtil } from 'src/common/utils/encryption.util';
import { DatabaseService } from '../database/database.service';
import { CreatePropertyDto, UpdatePropertyDto } from './property.dto';
import { IPropertyRepository } from './property.interface';

@Injectable()
export class PropertyRepository implements IPropertyRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
    private readonly encryptionUtil: EncryptionUtil,
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
        portfolio_id,
        sub_portfolio_id,
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

      // Build additional conditions array
      const additionalConditions = [];

      if (search) {
        additionalConditions.push({
          name: {
            contains: search,
            mode: 'insensitive',
          },
        });
      }

      if (start_date && end_date) {
        additionalConditions.push({
          createdAt: {
            gte: new Date(start_date),
            lte: new Date(end_date),
          },
        });
      }

      // Add portfolio_id filtering
      if (portfolio_id) {
        additionalConditions.push({
          OR: [
            { portfolio_id: portfolio_id },
            { subPortfolio: { portfolio_id: portfolio_id } },
          ],
        });
      }

      // Add sub_portfolio_id filtering
      if (sub_portfolio_id) {
        additionalConditions.push({
          sub_portfolio_id: sub_portfolio_id,
        });
      }

      // Combine base filters with additional conditions
      if (additionalConditions.length > 0) {
        allFilters = {
          ...allFilters,
          AND: additionalConditions,
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
        portfolio_id,
        sub_portfolio_id,
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

      // Add portfolio_id filtering
      if (portfolio_id) {
        additionalConditions.push({
          OR: [
            { portfolio_id: portfolio_id },
            { subPortfolio: { portfolio_id: portfolio_id } },
          ],
        });
      }

      // Add sub_portfolio_id filtering
      if (sub_portfolio_id) {
        additionalConditions.push({
          sub_portfolio_id: sub_portfolio_id,
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

  async findPortfolioAndSubPortfolioForDropdown(user: any): Promise<any> {
    try {
      const isAdmin = user.role === RoleEnum.admin;

      if (isAdmin) {
        const portfolios = await this.db.portfolio.findMany({
          select: {
            id: true,
            name: true,
          },
        });

        const subPortfolios = await this.db.subPortfolio.findMany({
          select: {
            id: true,
            name: true,
          },
        });

        return {
          portfolios,
          subPortfolios,
        };
      } else {
        // For regular users, get only accessible portfolios and sub-portfolios
        const userPermissions =
          await this.db.userFeatureAccessPermission.findMany({
            where: {
              user_id: user.id,
            },
          });

        // Get portfolio IDs and sub-portfolio IDs from permissions
        const portfolioIds = userPermissions
          .map((perm) => perm.portfolio_id)
          .filter(Boolean);
        const subPortfolioIds = userPermissions
          .map((perm) => perm.sub_portfolio_id)
          .filter(Boolean);

        const portfolios = await this.db.portfolio.findMany({
          where: {
            id: {
              in: portfolioIds,
            },
          },
          select: {
            id: true,
            name: true,
          },
        });

        const subPortfolios = await this.db.subPortfolio.findMany({
          where: {
            OR: [
              {
                id: {
                  in: subPortfolioIds,
                },
              },
              {
                portfolio_id: {
                  in: portfolioIds,
                },
              },
            ],
          },
          select: {
            id: true,
            name: true,
          },
        });

        return {
          portfolios,
          subPortfolios,
        };
      }
    } catch (error) {
      this.logger.error(error);
      return {
        portfolios: [],
        subPortfolios: [],
      };
    }
  }

  async getPermission(id: string, userId: string): Promise<any> {
    const property = await this.db.property.findUnique({
      where: { id },
      include: {
        subPortfolio: {
          include: {
            portfolio: true,
          },
        },
        portfolio: true,
      },
    });

    if (!property) {
      return null;
    }

    const orConditions: any[] = [{ property_id: id }];

    if (property.sub_portfolio_id) {
      orConditions.push({ sub_portfolio_id: property.sub_portfolio_id });
    }

    if (property.subPortfolio?.portfolio_id) {
      orConditions.push({ portfolio_id: property.subPortfolio.portfolio_id });
    }

    if (property.portfolio_id) {
      orConditions.push({ portfolio_id: property.portfolio_id });
    }

    return this.db.userFeatureAccessPermission.findFirst({
      where: {
        user_id: userId,
        OR: orConditions,
      },
    });
  }

  async findAllByUserPermission(
    userId: string,
    isAdmin: boolean,
  ): Promise<Property[]> {
    try {
      if (isAdmin) {
        return await this.db.property.findMany({
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
      }

      // Non-admin users only see properties they have permissions for
      const userPermissions =
        await this.db.userFeatureAccessPermission.findMany({
          where: {
            user_id: userId,
          },
          include: {
            portfolio: true,
            subPortFolio: true,
            property: true,
          },
        });

      const propertyIds = new Set<string>();

      for (const permission of userPermissions) {
        if (permission.property_id) {
          propertyIds.add(permission.property_id);
        }

        if (permission.portfolio_id) {
          const portfolioProperties = await this.db.property.findMany({
            where: { portfolio_id: permission.portfolio_id },
            select: { id: true },
          });
          portfolioProperties.forEach((p) => propertyIds.add(p.id));
        }

        if (permission.sub_portfolio_id) {
          const subPortfolioProperties = await this.db.property.findMany({
            where: { sub_portfolio_id: permission.sub_portfolio_id },
            select: { id: true },
          });
          subPortfolioProperties.forEach((p) => propertyIds.add(p.id));
        }
      }

      return await this.db.property.findMany({
        where: {
          id: {
            in: Array.from(propertyIds),
          },
        },
        include: {
          portfolio: true,
          subPortfolio: true,
        },
      });
    } catch (error) {
      this.logger.error('Error finding properties by user permission:', error);
      return [];
    }
  }

  // Portfolio operations
  async findPortfolioByName(name: string): Promise<any> {
    try {
      return await this.db.portfolio.findFirst({
        where: { name: name.trim() },
      });
    } catch (error) {
      this.logger.error(
        `Error finding portfolio by name: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  async createPortfolio(name: string): Promise<any> {
    try {
      return await this.db.portfolio.create({
        data: { name: name.trim() },
      });
    } catch (error) {
      this.logger.error(
        `Error creating portfolio: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  // Sub-portfolio operations
  async findSubPortfolioByNameAndPortfolio(
    name: string,
    portfolioId: string,
  ): Promise<any> {
    try {
      return await this.db.subPortfolio.findFirst({
        where: {
          name: name.trim(),
          portfolio_id: portfolioId,
        },
      });
    } catch (error) {
      this.logger.error(
        `Error finding sub-portfolio by name and portfolio: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  async createSubPortfolio(name: string, portfolioId: string): Promise<any> {
    try {
      return await this.db.subPortfolio.create({
        data: {
          name: name.trim(),
          portfolio_id: portfolioId,
        },
      });
    } catch (error) {
      this.logger.error(
        `Error creating sub-portfolio: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  // Property operations for import
  async findPropertyByNameAndRelations(
    name: string,
    portfolioId?: string,
    subPortfolioId?: string,
  ): Promise<any> {
    try {
      const whereClause: any = {
        name: name.trim(),
      };

      if (portfolioId) {
        whereClause.portfolio_id = portfolioId;
      }

      if (subPortfolioId) {
        whereClause.sub_portfolio_id = subPortfolioId;
      }

      return await this.db.property.findFirst({
        where: whereClause,
      });
    } catch (error) {
      this.logger.error(
        `Error finding property by name and relations: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  // Property credentials operations
  async createPropertyCredentials(
    propertyId: string,
    credentialsData: any,
  ): Promise<any> {
    try {
      const credentialsPayload: any = {
        property_id: propertyId,
      };

      // Add credential fields if they exist
      if (credentialsData.expediaUsername)
        credentialsPayload.expediaUsername = credentialsData.expediaUsername;
      if (credentialsData.expediaPassword)
        credentialsPayload.expediaPassword = credentialsData.expediaPassword;
      if (credentialsData.agodaUsername)
        credentialsPayload.agodaUsername = credentialsData.agodaUsername;
      if (credentialsData.agodaPassword)
        credentialsPayload.agodaPassword = credentialsData.agodaPassword;
      if (credentialsData.bookingUsername)
        credentialsPayload.bookingUsername = credentialsData.bookingUsername;
      if (credentialsData.bookingPassword)
        credentialsPayload.bookingPassword = credentialsData.bookingPassword;
      if (credentialsData.expediaEmailAssociated)
        credentialsPayload.expediaEmailAssociated =
          credentialsData.expediaEmailAssociated;
      if (credentialsData.propertyContactEmail)
        credentialsPayload.propertyContactEmail =
          credentialsData.propertyContactEmail;
      if (credentialsData.portfolioContactEmail)
        credentialsPayload.portfolioContactEmail =
          credentialsData.portfolioContactEmail;
      if (
        credentialsData.multiplePortfolioEmails &&
        Array.isArray(credentialsData.multiplePortfolioEmails)
      ) {
        credentialsPayload.multiplePortfolioEmails =
          credentialsData.multiplePortfolioEmails;
      }

      return await this.db.propertyCredentials.create({
        data: credentialsPayload,
      });
    } catch (error) {
      this.logger.error(
        `Error creating property credentials: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async updatePropertyCredentials(
    propertyId: string,
    credentialsData: any,
  ): Promise<any> {
    try {
      const updatePayload: any = {};

      // Add credential fields if they exist (encrypt passwords)
      if (credentialsData.expediaUsername !== undefined)
        updatePayload.expediaUsername = credentialsData.expediaUsername;
      if (credentialsData.expediaPassword !== undefined)
        updatePayload.expediaPassword = this.encryptionUtil.encryptPassword(
          credentialsData.expediaPassword,
        );
      if (credentialsData.agodaUsername !== undefined)
        updatePayload.agodaUsername = credentialsData.agodaUsername;
      if (credentialsData.agodaPassword !== undefined)
        updatePayload.agodaPassword = this.encryptionUtil.encryptPassword(
          credentialsData.agodaPassword,
        );
      if (credentialsData.bookingUsername !== undefined)
        updatePayload.bookingUsername = credentialsData.bookingUsername;
      if (credentialsData.bookingPassword !== undefined)
        updatePayload.bookingPassword = this.encryptionUtil.encryptPassword(
          credentialsData.bookingPassword,
        );
      if (credentialsData.expediaEmailAssociated !== undefined)
        updatePayload.expediaEmailAssociated =
          credentialsData.expediaEmailAssociated;
      if (credentialsData.propertyContactEmail !== undefined)
        updatePayload.propertyContactEmail =
          credentialsData.propertyContactEmail;
      if (credentialsData.portfolioContactEmail !== undefined)
        updatePayload.portfolioContactEmail =
          credentialsData.portfolioContactEmail;
      if (credentialsData.multiplePortfolioEmails !== undefined)
        updatePayload.multiplePortfolioEmails =
          credentialsData.multiplePortfolioEmails;

      // Check if credentials exist for this property
      const existingCredentials = await this.db.propertyCredentials.findFirst({
        where: { property_id: propertyId },
      });

      if (existingCredentials) {
        // Update existing credentials
        return await this.db.propertyCredentials.update({
          where: { id: existingCredentials.id },
          data: updatePayload,
        });
      } else {
        // Create new credentials
        return await this.db.propertyCredentials.create({
          data: {
            property_id: propertyId,
            ...updatePayload,
          },
        });
      }
    } catch (error) {
      this.logger.error(
        `Error updating property credentials: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findPropertyCredentialsByPropertyId(propertyId: string): Promise<any> {
    try {
      return await this.db.propertyCredentials.findFirst({
        where: { property_id: propertyId },
      });
    } catch (error) {
      this.logger.error(
        `Error finding property credentials: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }
}
