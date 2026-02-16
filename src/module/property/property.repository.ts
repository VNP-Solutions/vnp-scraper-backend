import { Injectable, Logger } from '@nestjs/common';
import { Property, RoleEnum } from '@prisma/client';
import { EncryptionUtil } from 'src/common/utils/encryption.util';
import * as XLSX from 'xlsx';
import { DatabaseService } from '../database/database.service';
import { CreatePropertyDto, UpdatePropertyDto } from './property.dto';
import { IPropertyRepository } from './property.interface';

@Injectable()
export class PropertyRepository implements IPropertyRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
    private readonly encryptionUtil: EncryptionUtil,
  ) { }

  get databaseService(): DatabaseService {
    return this.db;
  }

  async create(data: CreatePropertyDto): Promise<Property> {
    const propertyData: CreatePropertyDto = {
      name: data.name,
      portfolio_id: data.portfolio_id,
      sub_portfolio_id: data.sub_portfolio_id,
      expedia_status: data.expedia_status || 'Access Required',
      booking_status: data.booking_status || 'Access Required',
      agoda_status: data.agoda_status || 'Access Required',
    };

    if (data.expedia_id) {
      propertyData.expedia_id = data.expedia_id;
    }
    if (data.booking_id) {
      propertyData.booking_id = data.booking_id;
    }
    if (data.agoda_id) {
      propertyData.agoda_id = data.agoda_id;
    }

    try {
      const property = await this.db.property.create({
        data: propertyData,
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

  async findByExpediaId(expediaId: number): Promise<Property | null> {
    try {
      const property = await this.db.property.findFirst({
        where: {
          expedia_id: expediaId,
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

  async findByAgodaId(agodaId: number): Promise<Property | null> {
    try {
      const property = await this.db.property.findFirst({
        where: {
          agoda_id: agodaId,
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

  async mergePropertyCredentials(
    propertyId: string,
    credentialsData: any,
  ): Promise<any> {
    try {
      // Get existing credentials first
      const existingCredentials = await this.db.propertyCredentials.findFirst({
        where: { property_id: propertyId },
      });

      const updatePayload: any = {};

      // Update credentials with new values from Excel import
      if (credentialsData.expediaUsername)
        updatePayload.expediaUsername = credentialsData.expediaUsername;
      if (credentialsData.expediaPassword)
        updatePayload.expediaPassword = credentialsData.expediaPassword; // Already encrypted from import
      if (credentialsData.agodaUsername)
        updatePayload.agodaUsername = credentialsData.agodaUsername;
      if (credentialsData.agodaPassword)
        updatePayload.agodaPassword = credentialsData.agodaPassword; // Already encrypted from import
      if (credentialsData.bookingUsername)
        updatePayload.bookingUsername = credentialsData.bookingUsername;
      if (credentialsData.bookingPassword)
        updatePayload.bookingPassword = credentialsData.bookingPassword; // Already encrypted from import
      if (credentialsData.expediaEmailAssociated)
        updatePayload.expediaEmailAssociated =
          credentialsData.expediaEmailAssociated;
      if (credentialsData.propertyContactEmail)
        updatePayload.propertyContactEmail =
          credentialsData.propertyContactEmail;
      if (credentialsData.portfolioContactEmail)
        updatePayload.portfolioContactEmail =
          credentialsData.portfolioContactEmail;
      if (credentialsData.multiplePortfolioEmails)
        updatePayload.multiplePortfolioEmails =
          credentialsData.multiplePortfolioEmails;

      // If no new fields to add, skip update
      if (Object.keys(updatePayload).length === 0) {
        this.logger.log(
          `No new credentials to merge for property: ${propertyId}`,
        );
        return existingCredentials;
      }

      if (existingCredentials) {
        // Update existing credentials with new values
        return await this.db.propertyCredentials.update({
          where: { id: existingCredentials.id },
          data: updatePayload,
        });
      } else {
        // Create new credentials if none exist
        return await this.db.propertyCredentials.create({
          data: {
            property_id: propertyId,
            ...updatePayload,
          },
        });
      }
    } catch (error) {
      this.logger.error(
        `Error merging property credentials: ${error.message}`,
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

  /**
   * Import properties from Excel file
   *
   * Expected Excel format:
   * - Required columns: "Property Name"
   * - Optional columns: "Portfolio", "Sub Portfolio", "email", "password"
   * - OTA columns: "Expedia ID", "Expedia Status", "Booking ID", "Booking Status", "Agoda ID", "Agoda Status"
   * - Credential columns: "Expedia Username", "Expedia Password", "Agoda Username", "Agoda Password", "Booking Username", "Booking Password", "Expedia Email Associated", "Property Contact Email", "Portfolio Contact Email"
   *
   * The method will:
   * 1. Extract unique portfolio names and create them if they don't exist
   * 2. Extract unique sub-portfolio names and create them if they don't exist (linked to portfolios)
   * 3. Create properties with relationships to portfolios and sub-portfolios
   * 4. Create property credentials for OTA platforms
   *
   * @param file - Excel file buffer
   * @returns Object containing creation counts and created entities
   */
  async importPropertiesFromExcel(file: Express.Multer.File): Promise<{
    portfoliosCreated: number;
    subPortfoliosCreated: number;
    propertiesCreated: number;
    credentialsCreated: number;
    portfolios: any[];
    subPortfolios: any[];
    properties: any[];
  }> {
    try {
      // Validate file buffer
      if (!file.buffer) {
        throw new Error('File buffer is empty');
      }

      // Parse Excel file
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      if (!data || data.length === 0) {
        throw new Error('Excel file is empty or invalid');
      }

      // Get headers from first row
      const headers = Object.keys(data[0] as any);

      // Check required headers
      if (!headers.includes('Property Name')) {
        throw new Error('Property Name column is required in Excel file');
      }

      this.logger.log(
        `Starting import process for ${data.length} rows with headers: ${headers.join(', ')}`,
      );

      let portfoliosCreated = 0;
      let subPortfoliosCreated = 0;
      let propertiesCreated = 0;
      let credentialsCreated = 0;
      const portfolios: any[] = [];
      const subPortfolios: any[] = [];
      const properties: any[] = [];

      // Step 1: Handle Portfolios
      if (headers.includes('Portfolio')) {
        const portfolioNames = [
          ...new Set(
            data
              .map((row: any) => row.Portfolio)
              .filter((name) => name && name.trim() !== ''),
          ),
        ];

        this.logger.log(
          `Found ${portfolioNames.length} unique portfolios to process`,
        );

        for (const portfolioName of portfolioNames) {
          try {
            // Check if portfolio exists
            const existingPortfolio = await this.findPortfolioByName(
              portfolioName.toString(),
            );

            if (!existingPortfolio) {
              // Create new portfolio
              const newPortfolio = await this.createPortfolio(
                portfolioName.toString(),
              );
              portfolios.push(newPortfolio);
              portfoliosCreated++;
              this.logger.log(`Created new portfolio: ${newPortfolio.name}`);
            } else {
              portfolios.push(existingPortfolio);
              this.logger.log(
                `Using existing portfolio: ${existingPortfolio.name}`,
              );
            }
          } catch (error) {
            this.logger.error(
              `Error processing portfolio ${portfolioName}: ${error.message}`,
            );
            throw error;
          }
        }
      }

      // Step 2: Handle Sub Portfolios
      if (headers.includes('Sub Portfolio')) {
        const subPortfolioData = data
          .map((row: any) => ({
            subPortfolioName: row['Sub Portfolio'],
            portfolioName: row['Portfolio'],
          }))
          .filter(
            (item) =>
              item.subPortfolioName && item.subPortfolioName.trim() !== '',
          );

        // Get unique sub-portfolio names
        const uniqueSubPortfolios = [
          ...new Set(subPortfolioData.map((item) => item.subPortfolioName)),
        ];

        this.logger.log(
          `Found ${uniqueSubPortfolios.length} unique sub-portfolios to process`,
        );

        for (const subPortfolioName of uniqueSubPortfolios) {
          try {
            // Find the corresponding portfolio for this sub-portfolio
            const relatedData = subPortfolioData.find(
              (item) => item.subPortfolioName === subPortfolioName,
            );
            const portfolioName = relatedData?.portfolioName;

            if (portfolioName) {
              const portfolio = portfolios.find(
                (p) => p.name === portfolioName.toString().trim(),
              );

              if (portfolio) {
                // Check if sub-portfolio exists
                const existingSubPortfolio =
                  await this.findSubPortfolioByNameAndPortfolio(
                    subPortfolioName.toString(),
                    portfolio.id,
                  );

                if (!existingSubPortfolio) {
                  // Create new sub-portfolio
                  const newSubPortfolio = await this.createSubPortfolio(
                    subPortfolioName.toString(),
                    portfolio.id,
                  );
                  subPortfolios.push(newSubPortfolio);
                  subPortfoliosCreated++;
                  this.logger.log(
                    `Created new sub-portfolio: ${newSubPortfolio.name} under portfolio: ${portfolio.name}`,
                  );
                } else {
                  subPortfolios.push(existingSubPortfolio);
                  this.logger.log(
                    `Using existing sub-portfolio: ${existingSubPortfolio.name}`,
                  );
                }
              } else {
                this.logger.warn(
                  `Portfolio '${portfolioName}' not found for sub-portfolio '${subPortfolioName}'`,
                );
              }
            } else {
              this.logger.warn(
                `No portfolio specified for sub-portfolio '${subPortfolioName}'`,
              );
            }
          } catch (error) {
            this.logger.error(
              `Error processing sub-portfolio ${subPortfolioName}: ${error.message}`,
            );
            throw error;
          }
        }
      }

      // Step 3: Handle Properties
      this.logger.log(`Processing ${data.length} properties`);

      for (const row of data) {
        const rowData = row as any;

        if (
          !rowData['Property Name'] ||
          rowData['Property Name'].trim() === ''
        ) {
          continue;
        }

        try {
          // Find related portfolio and sub-portfolio
          let portfolioId = null;
          let subPortfolioId = null;

          if (rowData.Portfolio) {
            const portfolio = portfolios.find(
              (p) => p.name === rowData.Portfolio.toString().trim(),
            );
            if (portfolio) {
              portfolioId = portfolio.id;
            }
          }

          if (rowData['Sub Portfolio']) {
            const subPortfolio = subPortfolios.find(
              (sp) => sp.name === rowData['Sub Portfolio'].toString().trim(),
            );
            if (subPortfolio) {
              subPortfolioId = subPortfolio.id;
            }
          }

          // Check if property already exists
          const existingProperty = await this.findPropertyByNameAndRelations(
            rowData['Property Name'].toString(),
            portfolioId,
            subPortfolioId,
          );

          if (!existingProperty) {
            // Create property data
            const propertyData: CreatePropertyDto = {
              name: rowData['Property Name'].toString().trim(),
              portfolio_id: portfolioId,
              sub_portfolio_id: subPortfolioId,
              expedia_status: rowData['Expedia Status'] || 'Access Required',
              booking_status: rowData['Booking Status'] || 'Access Required',
              agoda_status: rowData['Agoda Status'] || 'Access Required',
            };

            if (rowData['Expedia ID']) {
              propertyData.expedia_id = Number(rowData['Expedia ID']);
            }

            if (rowData['Booking ID']) {
              propertyData.booking_id = Number(rowData['Booking ID']);
            }
            if (rowData['Agoda ID']) {
              propertyData.agoda_id = Number(rowData['Agoda ID']);
            }

            // Create property using repository method
            const newProperty = await this.create(propertyData);
            properties.push(newProperty);
            propertiesCreated++;
            this.logger.log(`Created new property: ${newProperty.name}`);

            // Create property credentials if any credential data exists
            const credentialsData: any = {};
            let hasCredentials = false;

            // Check for credential columns and extract data
            if (rowData['Expedia Username']) {
              credentialsData.expediaUsername = rowData['Expedia Username']
                .toString()
                .trim();
              hasCredentials = true;
            }
            if (rowData['Expedia Password']) {
              credentialsData.expediaPassword =
                this.encryptionUtil.encryptPassword(
                  rowData['Expedia Password'].toString().trim(),
                );
              hasCredentials = true;
            }
            if (rowData['Agoda Username']) {
              credentialsData.agodaUsername = rowData['Agoda Username']
                .toString()
                .trim();
              hasCredentials = true;
            }
            if (rowData['Agoda Password']) {
              credentialsData.agodaPassword =
                this.encryptionUtil.encryptPassword(
                  rowData['Agoda Password'].toString().trim(),
                );
              hasCredentials = true;
            }
            if (rowData['Booking Username']) {
              credentialsData.bookingUsername = rowData['Booking Username']
                .toString()
                .trim();
              hasCredentials = true;
            }
            if (rowData['Booking Password']) {
              credentialsData.bookingPassword =
                this.encryptionUtil.encryptPassword(
                  rowData['Booking Password'].toString().trim(),
                );
              hasCredentials = true;
            }
            if (rowData['Expedia Email Associated']) {
              credentialsData.expediaEmailAssociated = rowData[
                'Expedia Email Associated'
              ]
                .toString()
                .trim();
              hasCredentials = true;
            }
            if (rowData['Property Contact Email']) {
              credentialsData.propertyContactEmail = rowData[
                'Property Contact Email'
              ]
                .toString()
                .trim();
              hasCredentials = true;
            }
            if (rowData['Portfolio Contact Email']) {
              credentialsData.portfolioContactEmail = rowData[
                'Portfolio Contact Email'
              ]
                .toString()
                .trim();
              hasCredentials = true;
            }
            if (rowData['Multiple Portfolio Emails']) {
              // Handle comma-separated emails
              const emails = rowData['Multiple Portfolio Emails']
                .toString()
                .split(',')
                .map((email: string) => email.trim())
                .filter((email: string) => email);
              if (emails.length > 0) {
                credentialsData.multiplePortfolioEmails = emails;
                hasCredentials = true;
              }
            }

            // Create credentials if any credential data exists
            if (hasCredentials) {
              try {
                await this.createPropertyCredentials(
                  newProperty.id,
                  credentialsData,
                );
                credentialsCreated++;
                this.logger.log(
                  `Created credentials for property: ${newProperty.name}`,
                );
              } catch (credentialError) {
                this.logger.error(
                  `Error creating credentials for property ${newProperty.name}: ${credentialError.message}`,
                );
                // Don't fail the entire import if credentials creation fails
              }
            }
          } else {
            this.logger.log(
              `Property '${rowData['Property Name']}' already exists, checking for new credentials to merge`,
            );

            // Process credentials for existing property
            const credentialsData: any = {};
            let hasCredentials = false;

            // Check for credential columns and extract data
            if (rowData['Expedia Username']) {
              credentialsData.expediaUsername = rowData['Expedia Username']
                .toString()
                .trim();
              hasCredentials = true;
            }
            if (rowData['Expedia Password']) {
              credentialsData.expediaPassword =
                this.encryptionUtil.encryptPassword(
                  rowData['Expedia Password'].toString().trim(),
                );
              hasCredentials = true;
            }
            if (rowData['Agoda Username']) {
              credentialsData.agodaUsername = rowData['Agoda Username']
                .toString()
                .trim();
              hasCredentials = true;
            }
            if (rowData['Agoda Password']) {
              credentialsData.agodaPassword =
                this.encryptionUtil.encryptPassword(
                  rowData['Agoda Password'].toString().trim(),
                );
              hasCredentials = true;
            }
            if (rowData['Booking Username']) {
              credentialsData.bookingUsername = rowData['Booking Username']
                .toString()
                .trim();
              hasCredentials = true;
            }
            if (rowData['Booking Password']) {
              credentialsData.bookingPassword =
                this.encryptionUtil.encryptPassword(
                  rowData['Booking Password'].toString().trim(),
                );
              hasCredentials = true;
            }
            if (rowData['Expedia Email Associated']) {
              credentialsData.expediaEmailAssociated = rowData[
                'Expedia Email Associated'
              ]
                .toString()
                .trim();
              hasCredentials = true;
            }
            if (rowData['Property Contact Email']) {
              credentialsData.propertyContactEmail = rowData[
                'Property Contact Email'
              ]
                .toString()
                .trim();
              hasCredentials = true;
            }
            if (rowData['Portfolio Contact Email']) {
              credentialsData.portfolioContactEmail = rowData[
                'Portfolio Contact Email'
              ]
                .toString()
                .trim();
              hasCredentials = true;
            }
            if (rowData['Multiple Portfolio Emails']) {
              // Handle comma-separated emails
              const emails = rowData['Multiple Portfolio Emails']
                .toString()
                .split(',')
                .map((email: string) => email.trim())
                .filter((email: string) => email);
              if (emails.length > 0) {
                credentialsData.multiplePortfolioEmails = emails;
                hasCredentials = true;
              }
            }

            // Update property with IDs if they exist
            const propertyUpdateData: any = {};
            if (rowData['Expedia ID']) {
              propertyUpdateData.expedia_id = Number(rowData['Expedia ID']);
            }
            if (rowData['Booking ID']) {
              propertyUpdateData.booking_id = Number(rowData['Booking ID']);
            }
            if (rowData['Agoda ID']) {
              propertyUpdateData.agoda_id = Number(rowData['Agoda ID']);
            }

            // Update property if there are IDs to update
            if (Object.keys(propertyUpdateData).length > 0) {
              try {
                await this.update(existingProperty.id, propertyUpdateData);
                this.logger.log(
                  `Updated property IDs for: ${existingProperty.name}`,
                );
              } catch (updateError) {
                this.logger.error(
                  `Error updating property IDs for ${existingProperty.name}: ${updateError.message}`,
                );
              }
            }

            // Merge credentials if any credential data exists
            if (hasCredentials) {
              try {
                await this.mergePropertyCredentials(
                  existingProperty.id,
                  credentialsData,
                );
                credentialsCreated++;
                this.logger.log(
                  `Merged credentials for existing property: ${existingProperty.name}`,
                );
              } catch (credentialError) {
                this.logger.error(
                  `Error merging credentials for property ${existingProperty.name}: ${credentialError.message}`,
                );
                // Don't fail the entire import if credentials merge fails
              }
            }
          }
        } catch (error) {
          this.logger.error(
            `Error processing property ${rowData['Property Name']}: ${error.message}`,
          );
          // Continue with next property instead of stopping the entire import
        }
      }

      this.logger.log(
        `Import completed: ${portfoliosCreated} portfolios, ${subPortfoliosCreated} sub-portfolios, ${propertiesCreated} properties, and ${credentialsCreated} credentials created`,
      );

      return {
        portfoliosCreated,
        subPortfoliosCreated,
        propertiesCreated,
        credentialsCreated,
        portfolios,
        subPortfolios,
        properties,
      };
    } catch (error) {
      this.logger.error(
        `Error importing properties from Excel: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Encrypts a raw password
   * @param rawPassword - The plain text password to encrypt
   * @returns The encrypted password as a JSON string
   */
  encryptRawPassword(rawPassword: string): string {
    try {
      return this.encryptionUtil.encryptPassword(rawPassword);
    } catch (error) {
      this.logger.error(
        `Error encrypting password: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
