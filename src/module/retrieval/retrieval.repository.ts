import { Injectable } from '@nestjs/common';
import {
  Batch,
  ParentRetrieval,
  Retrieval,
  RetrievalItem,
} from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import {
  CreateBatchDto,
  CreateParentRetrievalDto,
  CreateRetrievalDto,
  CreateRetrievalItemDto,
  UpdateRetrievalDto,
} from './retrieval.dto';
import { IRetrievalRepository } from './retrieval.interface';

@Injectable()
export class RetrievalRepository implements IRetrievalRepository {
  constructor(private readonly prisma: DatabaseService) {}

  async createParentRetrieval(
    data: CreateParentRetrievalDto,
  ): Promise<ParentRetrieval> {
    return this.prisma.parentRetrieval.create({
      data,
    });
  }

  async findAllParentRetrievals(
    query: Record<string, any>,
  ): Promise<{ data: ParentRetrieval[]; metadata: any }> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'name',
      sortOrder = 'desc',
      search,
      start_date,
      end_date,
      is_archived,
      ...filters
    } = query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);
    const where: any = { ...filters };

    // Search functionality
    if (search) {
      const searchTerm = search.toString().trim();
      const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(searchTerm);

      where.OR = [
        ...(isValidObjectId ? [{ id: searchTerm }] : []),
        { name: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    // Handle is_archived filter (after search to properly merge OR conditions)
    if (is_archived !== undefined && is_archived !== null) {
      if (is_archived === 'true' || is_archived === true) {
        where.is_archived = true;
      } else if (is_archived === 'false' || is_archived === false) {
        // Include records where is_archived is false OR null/undefined (legacy data)
        const isArchivedFilter = {
          OR: [{ is_archived: false }, { is_archived: null }],
        };

        // If there's already an OR condition from search, wrap both in AND
        if (where.OR) {
          const existingOR = where.OR;
          delete where.OR;
          where.AND = [{ OR: existingOR }, isArchivedFilter];
        } else {
          where.OR = isArchivedFilter.OR;
        }
      }
    }

    // Date filtering
    if (start_date && end_date) {
      where.createdAt = {
        gte: new Date(start_date),
        lte: new Date(end_date),
      };
    }

    const orderBy = {
      [sortBy]: sortOrder.toLowerCase() === 'desc' ? 'desc' : 'asc',
    };

    const [data, total] = await Promise.all([
      this.prisma.parentRetrieval.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          _count: {
            select: {
              retrievals: true,
            },
          },
        },
      }),
      this.prisma.parentRetrieval.count({ where }),
    ]);

    return {
      data,
      metadata: {
        totalDocuments: total,
        currentPage: parseInt(page),
        totalPage: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit),
      },
    };
  }

  async createRetrieval(data: CreateRetrievalDto): Promise<Retrieval> {
    return this.prisma.retrieval.create({
      data,
    });
  }

  async createRetrievalItem(
    data: CreateRetrievalItemDto,
  ): Promise<RetrievalItem> {
    return this.prisma.retrievalItem.create({
      data,
    });
  }

  async createManyRetrievalItems(
    data: CreateRetrievalItemDto[],
  ): Promise<void> {
    await this.prisma.retrievalItem.createMany({
      data,
    });
  }

  async findAllRetrievals(
    query: Record<string, any>,
  ): Promise<{ data: Retrieval[]; metadata: any }> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      is_archived,
      ...filters
    } = query;

    const skip = (page - 1) * limit;
    const where: any = {};

    if (filters.parent_retrieval_id) {
      where.parent_retrieval_id = filters.parent_retrieval_id;
    }

    if (filters.property_id) {
      where.property_id = filters.property_id;
    }

    if (filters.job_status) {
      where.job_status = filters.job_status;
    }

    if (filters.ota_provider) {
      where.ota_provider = filters.ota_provider;
    }

    if (filters.posting_type) {
      where.posting_type = filters.posting_type;
    }

    // Handle is_archived filter
    if (is_archived !== undefined && is_archived !== null) {
      if (is_archived === 'true' || is_archived === true) {
        where.is_archived = true;
      } else if (is_archived === 'false' || is_archived === false) {
        // Include records where is_archived is false OR null/undefined (legacy data)
        const isArchivedFilter = {
          OR: [{ is_archived: false }, { is_archived: null }],
        };

        // If there's already an OR condition, wrap both in AND
        if (where.OR) {
          const existingOR = where.OR;
          delete where.OR;
          where.AND = [{ OR: existingOR }, isArchivedFilter];
        } else {
          where.OR = isArchivedFilter.OR;
        }
      }
    }

    // Handle is_archived filter
    if (is_archived !== undefined && is_archived !== null) {
      if (is_archived === 'true' || is_archived === true) {
        where.is_archived = true;
      } else if (is_archived === 'false' || is_archived === false) {
        // Include records where is_archived is false OR null/undefined (legacy data)
        const isArchivedFilter = {
          OR: [{ is_archived: false }, { is_archived: null }],
        };

        // If there's already an OR condition, wrap both in AND
        if (where.OR) {
          const existingOR = where.OR;
          delete where.OR;
          where.AND = [{ OR: existingOR }, isArchivedFilter];
        } else {
          where.OR = isArchivedFilter.OR;
        }
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.retrieval.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          parentRetrieval: true,
          retrievalItems: true,
        },
      }),
      this.prisma.retrieval.count({ where }),
    ]);

    return {
      data,
      metadata: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findRetrievalById(id: string): Promise<Retrieval | null> {
    return this.prisma.retrieval.findUnique({
      where: { id },
      include: {
        parentRetrieval: true,
        retrievalItems: true,
      },
    });
  }

  async findParentRetrievalById(id: string): Promise<ParentRetrieval | null> {
    return this.prisma.parentRetrieval.findUnique({
      where: { id },
      include: {
        retrievals: true,
        retrievalItems: true,
      },
    });
  }

  async findRetrievalItemsByParentRetrievalId(
    parentRetrievalId: string,
  ): Promise<RetrievalItem[]> {
    return this.prisma.retrievalItem.findMany({
      where: { parent_retrieval_id: parentRetrievalId },
      include: {
        retrieval: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async findRetrievalItemsByRetrievalId(
    retrievalId: string,
    query: Record<string, any>,
  ): Promise<{ data: RetrievalItem[]; metadata: any }> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search,
      start_date,
      end_date,
      reservation_status,
      ...filters
    } = query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);
    const where: any = {
      retrieval_id: retrievalId,
      ...filters,
    };

    // Search functionality
    if (search) {
      const searchTerm = search.toString().trim();
      where.OR = [
        { reservation_id: { contains: searchTerm, mode: 'insensitive' } },
        { guest_name: { contains: searchTerm, mode: 'insensitive' } },
        { confirmation_number: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    // Date filtering
    if (start_date && end_date) {
      where.check_in_date = {
        gte: new Date(start_date),
        lte: new Date(end_date),
      };
    }

    // Status filtering
    if (reservation_status) {
      where.reservation_status = reservation_status;
    }

    const orderBy = {
      [sortBy]: sortOrder.toLowerCase() === 'desc' ? 'desc' : 'asc',
    };

    const [data, total] = await Promise.all([
      this.prisma.retrievalItem.findMany({
        where,
        skip,
        take,
        orderBy,
      }),
      this.prisma.retrievalItem.count({ where }),
    ]);

    return {
      data,
      metadata: {
        totalDocuments: total,
        currentPage: parseInt(page),
        totalPage: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit),
      },
    };
  }

  async findRetrievalsByParentRetrievalId(
    parentRetrievalId: string,
    query: Record<string, any>,
  ): Promise<{ data: Retrieval[]; metadata: any }> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search,
      start_date,
      end_date,
      job_status,
      ota_provider,
      posting_type,
      property_name,
      portfolio_name,
      sub_portfolio_name,
      batch_id,
      is_archived,
      ...filters
    } = query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);
    const where: any = {
      parent_retrieval_id: parentRetrievalId,
      ...filters,
    };

    // Search functionality
    if (search) {
      const searchTerm = search.toString().trim();
      const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(searchTerm);

      where.OR = [
        // Retrieval fields - only search by ID if it's a valid ObjectId format
        ...(isValidObjectId ? [{ id: searchTerm }] : []),
        { name: { contains: searchTerm, mode: 'insensitive' } },

        // Portfolio/Sub-portfolio/Property names (stored as plain fields, not relationships)
        { portfolio_name: { contains: searchTerm, mode: 'insensitive' } },
        { sub_portfolio_name: { contains: searchTerm, mode: 'insensitive' } },
        { property_name: { contains: searchTerm, mode: 'insensitive' } },

        // OTA provider search
        ...(searchTerm.toLowerCase() === 'expedia' ||
        searchTerm.toLowerCase() === 'booking' ||
        searchTerm.toLowerCase() === 'agoda'
          ? [
              {
                ota_provider: {
                  equals:
                    searchTerm.charAt(0).toUpperCase() +
                    searchTerm.slice(1).toLowerCase(),
                  mode: 'insensitive',
                },
              },
            ]
          : []),
      ];
    }

    // Date filtering
    if (start_date && end_date) {
      where.createdAt = {
        gte: new Date(start_date),
        lte: new Date(end_date),
      };
    }

    // Status filtering
    if (job_status) {
      where.job_status = job_status;
    }

    // OTA provider filtering
    if (ota_provider) {
      where.ota_provider = ota_provider;
    }

    // Posting type filtering
    if (posting_type) {
      where.posting_type = posting_type;
    }

    // Property name filtering (partial match)
    if (property_name) {
      where.property_name = {
        contains: property_name.toString().trim(),
        mode: 'insensitive',
      };
    }

    // Portfolio name filtering (partial match)
    if (portfolio_name) {
      where.portfolio_name = {
        contains: portfolio_name.toString().trim(),
        mode: 'insensitive',
      };
    }

    // Sub-portfolio name filtering (partial match)
    if (sub_portfolio_name) {
      where.sub_portfolio_name = {
        contains: sub_portfolio_name.toString().trim(),
        mode: 'insensitive',
      };
    }

    // Batch ID filtering
    if (batch_id) {
      where.batch_id = batch_id;
    }

    // Handle is_archived filter (after search to properly merge OR conditions)
    if (is_archived !== undefined && is_archived !== null) {
      if (is_archived === 'true' || is_archived === true) {
        where.is_archived = true;
      } else if (is_archived === 'false' || is_archived === false) {
        // Include records where is_archived is false OR null/undefined (legacy data)
        const isArchivedFilter = {
          OR: [{ is_archived: false }, { is_archived: null }],
        };

        // If there's already an OR condition from search, wrap both in AND
        if (where.OR) {
          const existingOR = where.OR;
          delete where.OR;
          where.AND = [{ OR: existingOR }, isArchivedFilter];
        } else {
          where.OR = isArchivedFilter.OR;
        }
      }
    }

    const orderBy = {
      [sortBy]: sortOrder.toLowerCase() === 'desc' ? 'desc' : 'asc',
    };

    // Include only available relationships
    const include = {
      parentRetrieval: {
        select: {
          id: true,
          name: true,
        },
      },
      retrievalItems: true,
      batch: true,
    };

    const [data, total] = await Promise.all([
      this.prisma.retrieval.findMany({
        where,
        skip,
        take,
        orderBy,
        include,
      }),
      this.prisma.retrieval.count({ where }),
    ]);

    return {
      data,
      metadata: {
        totalDocuments: total,
        currentPage: parseInt(page),
        totalPage: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit),
      },
    };
  }

  async updateRetrieval(
    id: string,
    data: UpdateRetrievalDto,
  ): Promise<Retrieval> {
    return this.prisma.retrieval.update({
      where: { id },
      data,
    });
  }

  async deleteRetrieval(id: string): Promise<void> {
    await this.prisma.retrieval.delete({
      where: { id },
    });
  }

  async deleteParentRetrieval(id: string): Promise<void> {
    await this.prisma.retrievalItem.deleteMany({
      where: { parent_retrieval_id: id },
    });

    await this.prisma.retrieval.deleteMany({
      where: { parent_retrieval_id: id },
    });

    await this.prisma.parentRetrieval.delete({
      where: { id },
    });
  }

  async createBatch(data: CreateBatchDto): Promise<Batch> {
    const batch = await this.prisma.batch.create({
      data: {
        name: data.name,
      },
    });
    return batch;
  }

  async findBatchByName(name: string): Promise<Batch | null> {
    const batch = await this.prisma.batch.findFirst({
      where: { name },
    });
    return batch;
  }

  async findBatchById(id: string): Promise<Batch | null> {
    const batch = await this.prisma.batch.findFirst({
      where: { id },
    });
    return batch;
  }

  async bulkBatchUpdate(
    retrievalIds: string[],
    batchId: string,
  ): Promise<{ count: number }> {
    // Verify batch exists
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId },
    });

    if (!batch) {
      throw new Error(`Batch with ID ${batchId} not found`);
    }

    // Update all retrievals with the batch_id
    const result = await this.prisma.retrieval.updateMany({
      where: {
        id: {
          in: retrievalIds,
        },
      },
      data: {
        batch_id: batchId,
      },
    });

    return result;
  }
}
