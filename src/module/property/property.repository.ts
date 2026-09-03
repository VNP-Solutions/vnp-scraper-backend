import { Injectable, Logger } from '@nestjs/common';
import {
  OTAProvider,
  PhoneNumberSlotStatus,
  Property,
  RoleEnum,
} from '@prisma/client';
import { EncryptionUtil } from 'src/common/utils/encryption.util';
import * as XLSX from 'xlsx';
import { getPhoneLastThreeDigitsKey } from '../phone-number-slot/phone-number-slot.utils';
import { DatabaseService } from '../database/database.service';
import { CreatePropertyDto, UpdatePropertyDto } from './property.dto';
import {
  IPropertyRepository,
  PropertyDropdownItem,
} from './property.interface';
import type { UpdateOtaCredentialsBody } from './property.validation';

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
    const propertyData: CreatePropertyDto = {
      name: data.name,
      portfolio_id: data.portfolio_id,
      sub_portfolio_id: data.sub_portfolio_id,
      expedia_status: data.expedia_status || 'Access Required',
      booking_status: data.booking_status || 'Access Required',
      agoda_status: data.agoda_status || 'Access Required',
    };

    if (data.parent_id !== undefined && data.parent_id !== null) {
      propertyData.parent_id = data.parent_id;
    }

    if (data.expedia_id) {
      propertyData.expedia_id = data.expedia_id;
    }
    if (data.booking_id) {
      propertyData.booking_id = data.booking_id;
    }
    if (data.agoda_id) {
      propertyData.agoda_id = data.agoda_id;
    }
    if (data.phone_number !== undefined && data.phone_number !== null) {
      propertyData.phone_number = data.phone_number;
    }
    if (data.slot !== undefined && data.slot !== null) {
      propertyData.slot = data.slot;
    }
    if (
      data.phone_number_slot_id !== undefined &&
      data.phone_number_slot_id !== null
    ) {
      propertyData.phone_number_slot_id = data.phone_number_slot_id;
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

  async createWithId(id: string, data: CreatePropertyDto): Promise<Property> {
    const propertyData: CreatePropertyDto & { id?: string } = {
      name: data.name,
      portfolio_id: data.portfolio_id,
      sub_portfolio_id: data.sub_portfolio_id,
      expedia_status: data.expedia_status || 'Access Required',
      booking_status: data.booking_status || 'Access Required',
      agoda_status: data.agoda_status || 'Access Required',
    };

    if (data.expedia_id) propertyData.expedia_id = data.expedia_id;
    if (data.booking_id) propertyData.booking_id = data.booking_id;
    if (data.agoda_id) propertyData.agoda_id = data.agoda_id;

    return this.db.property.create({
      data: {
        id,
        ...propertyData,
      },
    });
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
            phoneNumberSlot: true,
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
          phoneNumberSlot: true,
          portfolio: true,
          subPortfolio: {
            include: {
              portfolio: true,
            },
          },
        },
      });
      return property;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findByParentId(parentId: string): Promise<Property | null> {
    return this.db.property.findFirst({ where: { parent_id: parentId } });
  }

  async findPortfolioByParentId(parentId: string): Promise<any> {
    return this.db.portfolio.findFirst({ where: { parent_id: parentId } });
  }

  async findByParentIds(parentIds: string[]): Promise<Property[]> {
    if (!parentIds.length) return [];
    return this.db.property.findMany({
      where: { parent_id: { in: parentIds } },
    });
  }

  async findPortfoliosByParentIds(parentIds: string[]): Promise<any[]> {
    if (!parentIds.length) return [];
    return this.db.portfolio.findMany({
      where: { parent_id: { in: parentIds } },
    });
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

  async findByOtaIds(ids: {
    expedia_id: number | null;
    booking_id: number | null;
    agoda_id: number | null;
  }): Promise<Property | null> {
    const conditions: any[] = [];
    if (ids.expedia_id) conditions.push({ expedia_id: ids.expedia_id });
    if (ids.booking_id) conditions.push({ booking_id: ids.booking_id });
    if (ids.agoda_id) conditions.push({ agoda_id: ids.agoda_id });
    if (!conditions.length) return null;
    return this.db.property.findFirst({ where: { OR: conditions } });
  }

  async findByName(name: string): Promise<Property | null> {
    return this.db.property.findFirst({ where: { name } });
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
          phoneNumberSlot: true,
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
          phoneNumberSlot: true,
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
          phoneNumberSlot: true,
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
        phoneNumberSlot: true,
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
  ): Promise<PropertyDropdownItem[]> {
    try {
      const dropdownSelect = {
        id: true,
        name: true,
        portfolio_id: true,
      } as const;

      if (isAdmin) {
        return await this.db.property.findMany({
          select: dropdownSelect,
        });
      }

      // Non-admin users only see properties they have permissions for.
      // Fetch only the permission ids we need (avoids hydrating full relations).
      const userPermissions =
        await this.db.userFeatureAccessPermission.findMany({
          where: { user_id: userId },
          select: {
            property_id: true,
            portfolio_id: true,
            sub_portfolio_id: true,
          },
        });

      const directPropertyIds = new Set<string>();
      const portfolioIds = new Set<string>();
      const subPortfolioIds = new Set<string>();

      for (const permission of userPermissions) {
        if (permission.property_id) {
          directPropertyIds.add(permission.property_id);
        }
        if (permission.portfolio_id) {
          portfolioIds.add(permission.portfolio_id);
        }
        if (permission.sub_portfolio_id) {
          subPortfolioIds.add(permission.sub_portfolio_id);
        }
      }

      // Resolve all portfolio/sub-portfolio scoped properties in a single
      // OR query instead of one query per permission row.
      const orConditions: Array<Record<string, any>> = [];
      if (directPropertyIds.size > 0) {
        orConditions.push({ id: { in: Array.from(directPropertyIds) } });
      }
      if (portfolioIds.size > 0) {
        orConditions.push({
          portfolio_id: { in: Array.from(portfolioIds) },
        });
      }
      if (subPortfolioIds.size > 0) {
        orConditions.push({
          sub_portfolio_id: { in: Array.from(subPortfolioIds) },
        });
      }

      if (orConditions.length === 0) {
        return [];
      }

      return await this.db.property.findMany({
        where: { OR: orConditions },
        select: dropdownSelect,
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

      // A null password means the caller is clearing it (a DBMS sync of a
      // property whose password was emptied), so it must not go through the
      // cipher — that would store ciphertext for the word "null".
      const encryptOrClear = (password: string | null) =>
        password === null
          ? null
          : this.encryptionUtil.encryptPassword(password);

      // Add credential fields if they exist (encrypt passwords)
      if (credentialsData.expediaUsername !== undefined)
        updatePayload.expediaUsername = credentialsData.expediaUsername;
      if (credentialsData.expediaPassword !== undefined)
        updatePayload.expediaPassword = encryptOrClear(
          credentialsData.expediaPassword,
        );
      if (credentialsData.agodaUsername !== undefined)
        updatePayload.agodaUsername = credentialsData.agodaUsername;
      if (credentialsData.agodaPassword !== undefined)
        updatePayload.agodaPassword = encryptOrClear(
          credentialsData.agodaPassword,
        );
      if (credentialsData.bookingUsername !== undefined)
        updatePayload.bookingUsername = credentialsData.bookingUsername;
      if (credentialsData.bookingPassword !== undefined)
        updatePayload.bookingPassword = encryptOrClear(
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
   * Parse optional "Phone Number" and optional "Slot".
   * - Phone only: slot null → link by finding PhoneNumberSlot with same last-3-digit key.
   * - Phone + slot: match or create pool row as before.
   */
  private parsePhoneNumberAndSlotFromRow(rowData: any): {
    phone: string;
    slot: number | null;
  } | null {
    const rawPhone = rowData['Phone Number'];
    if (
      rawPhone === undefined ||
      rawPhone === null ||
      String(rawPhone).trim() === ''
    ) {
      return null;
    }
    const phone = String(rawPhone).trim();
    const rawSlot = rowData['Slot'];
    const slotEmpty =
      rawSlot === undefined ||
      rawSlot === null ||
      String(rawSlot).trim() === '';
    if (slotEmpty) {
      return { phone, slot: null };
    }
    const slotNum = parseInt(String(rawSlot).trim(), 10);
    if (Number.isNaN(slotNum)) {
      this.logger.warn(
        `Import: invalid Slot "${rawSlot}" for row "${rowData['Property Name'] ?? ''}"; resolving slot from pool by last 3 digits of phone`,
      );
      return { phone, slot: null };
    }
    return { phone, slot: slotNum };
  }

  /**
   * Import row gave phone but no slot: pick an existing PhoneNumberSlot whose number shares
   * the same last-3-digit key. Prefers exact digit-string match with the imported phone;
   * if several share only the last 3, uses the lowest slot and logs a warning.
   */
  private async resolveExistingPhoneNumberSlotIdByPhoneDigits(
    phone: string,
    contextLabel: string,
  ): Promise<{ id: string; slot: number } | null> {
    const key = getPhoneLastThreeDigitsKey(phone);
    if (!key) {
      this.logger.warn(
        `${contextLabel}: cannot resolve slot — no digits in phone "${phone}"`,
      );
      return null;
    }
    const rows = await this.db.phoneNumberSlot.findMany({
      select: { id: true, phone_number: true, slot: true },
    });
    const matches = rows.filter(
      (r) => getPhoneLastThreeDigitsKey(r.phone_number) === key,
    );
    if (matches.length === 0) {
      this.logger.warn(
        `${contextLabel}: no PhoneNumberSlot found for last 3 digits "${key}"`,
      );
      return null;
    }
    const importDigits = phone.replace(/\D/g, '');
    if (importDigits.length > 0) {
      const exact = matches.find(
        (r) => r.phone_number.replace(/\D/g, '') === importDigits,
      );
      if (exact) {
        return { id: exact.id, slot: exact.slot };
      }
    }
    if (matches.length === 1) {
      return { id: matches[0].id, slot: matches[0].slot };
    }
    const sorted = [...matches].sort((a, b) => a.slot - b.slot);
    const chosen = sorted[0];
    this.logger.warn(
      `${contextLabel}: ${matches.length} PhoneNumberSlots share last 3 digits "${key}"; using slot ${chosen.slot}`,
    );
    return { id: chosen.id, slot: chosen.slot };
  }

  private async resolvePhoneNumberSlotLinkForImport(
    parsed: { phone: string; slot: number | null },
    contextLabel: string,
  ): Promise<{ slotId: string; phone: string; slot: number } | null> {
    if (parsed.slot != null) {
      const slotId = await this.resolveOrCreatePhoneNumberSlotForImport(
        parsed.phone,
        parsed.slot,
      );
      return slotId ? { slotId, phone: parsed.phone, slot: parsed.slot } : null;
    }
    const found = await this.resolveExistingPhoneNumberSlotIdByPhoneDigits(
      parsed.phone,
      contextLabel,
    );
    return found
      ? { slotId: found.id, phone: parsed.phone, slot: found.slot }
      : null;
  }

  /**
   * If a PhoneNumberSlot exists with the same slot and same last-3-digit key, reuse its id.
   * Otherwise create a new pool row (Released, no job).
   */
  private async resolveOrCreatePhoneNumberSlotForImport(
    phone: string,
    slot: number,
  ): Promise<string | null> {
    const key = getPhoneLastThreeDigitsKey(phone);
    if (!key) {
      this.logger.warn(
        `Skipping phone slot link: no digits in phone "${phone}"`,
      );
      return null;
    }
    const candidates = await this.db.phoneNumberSlot.findMany({
      where: { slot },
    });
    const existing = candidates.find(
      (c) => getPhoneLastThreeDigitsKey(c.phone_number) === key,
    );
    if (existing) {
      return existing.id;
    }
    const created = await this.db.phoneNumberSlot.create({
      data: {
        phone_number: phone,
        slot,
        status: PhoneNumberSlotStatus.Released,
        job_id: null,
      },
    });
    return created.id;
  }

  /**
   * Import properties from Excel file
   *
   * Expected Excel format:
   * - Required columns: "Property Name"
   * - Optional columns: "Portfolio", "Sub Portfolio", "email", "password"
   * - Optional MFA pool: "Phone Number"; optional "Slot" — with slot: match by last 3 digits + slot or create pool row; phone only: find existing PhoneNumberSlot by last 3 digits (exact digit match preferred if several)
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

            const parsedPhoneSlot =
              this.parsePhoneNumberAndSlotFromRow(rowData);
            if (parsedPhoneSlot) {
              try {
                const resolved = await this.resolvePhoneNumberSlotLinkForImport(
                  parsedPhoneSlot,
                  `Phone slot (new property "${rowData['Property Name']}")`,
                );
                if (resolved) {
                  propertyData.phone_number = resolved.phone;
                  propertyData.slot = resolved.slot;
                  propertyData.phone_number_slot_id = resolved.slotId;
                }
              } catch (phoneSlotError: any) {
                this.logger.warn(
                  `Phone slot link skipped for new property ${rowData['Property Name']}: ${phoneSlotError?.message}`,
                );
              }
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

            const parsedPhoneSlotExisting =
              this.parsePhoneNumberAndSlotFromRow(rowData);
            if (parsedPhoneSlotExisting) {
              try {
                const resolved = await this.resolvePhoneNumberSlotLinkForImport(
                  parsedPhoneSlotExisting,
                  `Phone slot (existing property "${existingProperty.name}")`,
                );
                if (resolved) {
                  propertyUpdateData.phone_number = resolved.phone;
                  propertyUpdateData.slot = resolved.slot;
                  propertyUpdateData.phone_number_slot_id = resolved.slotId;
                }
              } catch (phoneSlotError: any) {
                this.logger.warn(
                  `Phone slot link skipped for existing property ${existingProperty.name}: ${phoneSlotError?.message}`,
                );
              }
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
   * Reads an Excel sheet with columns Expedia ID, Expedia Username, Expedia Password
   * (header matching is case-insensitive; expedia_id style also accepted).
   * For each row: finds all Properties with that expedia_id, then upserts
   * PropertyCredentials for each (passwords encrypted like other credential updates).
   */
  async importExpediaCredentialsFromExcel(file: Express.Multer.File): Promise<{
    updated: number;
    propertyNotFound: number;
    rowsSkippedInvalid: number;
    failures: Array<{ row: number; expediaId?: number; reason: string }>;
  }> {
    const normalizeHeader = (h: string) =>
      h.trim().toLowerCase().replace(/\s+/g, ' ');

    const getCell = (
      row: Record<string, unknown>,
      aliases: string[],
    ): unknown => {
      for (const key of Object.keys(row)) {
        const nk = normalizeHeader(key);
        for (const a of aliases) {
          if (nk === normalizeHeader(a)) {
            return row[key];
          }
        }
      }
      return undefined;
    };

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet) as Record<
      string,
      unknown
    >[];

    if (!data?.length) {
      throw new Error('Excel file is empty or invalid');
    }

    let updated = 0;
    let propertyNotFound = 0;
    let rowsSkippedInvalid = 0;
    const failures: Array<{ row: number; expediaId?: number; reason: string }> =
      [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const excelRow = i + 2;

      const expediaRaw = getCell(row, [
        'Expedia ID',
        'expedia_id',
        'expedia id',
      ]);
      if (
        expediaRaw === undefined ||
        expediaRaw === null ||
        (typeof expediaRaw === 'string' && expediaRaw.trim() === '')
      ) {
        rowsSkippedInvalid++;
        failures.push({ row: excelRow, reason: 'Missing Expedia ID' });
        continue;
      }

      const expediaId = Number(expediaRaw);
      if (!Number.isFinite(expediaId)) {
        rowsSkippedInvalid++;
        failures.push({ row: excelRow, reason: 'Invalid Expedia ID' });
        continue;
      }

      const usernameRaw = getCell(row, [
        'Expedia Username',
        'expedia_username',
        'expedia username',
      ]);
      const passwordRaw = getCell(row, [
        'Expedia Password',
        'expedia_password',
        'expedia password',
      ]);

      const expediaUsername =
        usernameRaw !== undefined && usernameRaw !== null
          ? String(usernameRaw).trim()
          : '';
      const expediaPassword =
        passwordRaw !== undefined && passwordRaw !== null
          ? String(passwordRaw).trim()
          : '';

      if (!expediaUsername && !expediaPassword) {
        rowsSkippedInvalid++;
        failures.push({
          row: excelRow,
          expediaId,
          reason: 'Expedia Username and Password are both empty',
        });
        continue;
      }

      const properties = await this.db.property.findMany({
        where: { expedia_id: expediaId },
        select: { id: true },
      });

      if (!properties.length) {
        propertyNotFound++;
        failures.push({
          row: excelRow,
          expediaId,
          reason: 'No property found for this Expedia ID',
        });
        continue;
      }

      const credentialsPayload: {
        expediaUsername?: string;
        expediaPassword?: string;
      } = {};
      if (expediaUsername) {
        credentialsPayload.expediaUsername = expediaUsername;
      }
      if (expediaPassword) {
        credentialsPayload.expediaPassword = expediaPassword;
      }

      for (const property of properties) {
        try {
          await this.updatePropertyCredentials(property.id, credentialsPayload);
          updated++;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Update failed';
          failures.push({
            row: excelRow,
            expediaId,
            reason: `${message} (property_id: ${property.id})`,
          });
        }
      }
    }

    return {
      updated,
      propertyNotFound,
      rowsSkippedInvalid,
      failures,
    };
  }

  private buildOtaCredentialsPayloadForOta(
    provider: OTAProvider,
    username: string,
    password: string,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    if (provider === OTAProvider.Expedia) {
      if (username) out.expediaUsername = username;
      if (password) out.expediaPassword = password;
    } else if (provider === OTAProvider.Agoda) {
      if (username) out.agodaUsername = username;
      if (password) out.agodaPassword = password;
    } else if (provider === OTAProvider.Booking) {
      if (username) out.bookingUsername = username;
      if (password) out.bookingPassword = password;
    }
    return out;
  }

  /**
   * Upsert property_credentials for one property; username/password fields depend on `ota_provider`.
   */
  async updateOtaCredentials(body: UpdateOtaCredentialsBody): Promise<{
    updated: number;
    propertyNotFound: boolean;
    failures: Array<{ reason: string; property_id?: string }>;
  }> {
    const { ota_provider, property_id: propertyId } = body;
    const username = body.username?.trim() ?? '';
    const password = body.password?.trim() ?? '';

    const failures: Array<{ reason: string; property_id?: string }> = [];

    const property = await this.findById(propertyId);
    if (!property) {
      return {
        updated: 0,
        propertyNotFound: true,
        failures: [],
      };
    }

    const credentialsPayload = this.buildOtaCredentialsPayloadForOta(
      ota_provider,
      username,
      password,
    );

    try {
      await this.updatePropertyCredentials(propertyId, credentialsPayload);
      return {
        updated: 1,
        propertyNotFound: false,
        failures: [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Update failed';
      failures.push({
        property_id: propertyId,
        reason: message,
      });
      return {
        updated: 0,
        propertyNotFound: false,
        failures,
      };
    }
  }

  private tryDecryptStoredPassword(
    encrypted: string | null | undefined,
  ): string {
    if (encrypted == null || String(encrypted).trim() === '') {
      return '';
    }
    try {
      return this.encryptionUtil.decryptPassword(encrypted);
    } catch (error) {
      this.logger.warn(
        `OTA password decrypt failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return '';
    }
  }

  async getOtaCredentialsReveal(
    propertyId: string,
    otaProvider: OTAProvider,
  ): Promise<{
    propertyNotFound: boolean;
    credentialsNotFound: boolean;
    username: string;
    password: string;
  }> {
    const property = await this.findById(propertyId);
    if (!property) {
      return {
        propertyNotFound: true,
        credentialsNotFound: false,
        username: '',
        password: '',
      };
    }

    const cred = await this.findPropertyCredentialsByPropertyId(propertyId);
    if (!cred) {
      return {
        propertyNotFound: false,
        credentialsNotFound: true,
        username: '',
        password: '',
      };
    }

    let username = '';
    let encryptedPassword: string | null | undefined;
    if (otaProvider === OTAProvider.Expedia) {
      username = cred.expediaUsername?.trim() ?? '';
      encryptedPassword = cred.expediaPassword;
    } else if (otaProvider === OTAProvider.Agoda) {
      username = cred.agodaUsername?.trim() ?? '';
      encryptedPassword = cred.agodaPassword;
    } else {
      username = cred.bookingUsername?.trim() ?? '';
      encryptedPassword = cred.bookingPassword;
    }

    return {
      propertyNotFound: false,
      credentialsNotFound: false,
      username,
      password: this.tryDecryptStoredPassword(encryptedPassword),
    };
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
