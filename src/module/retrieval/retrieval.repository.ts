import { Injectable } from '@nestjs/common';
import {
  Batch,
  ParentRetrieval,
  Retrieval,
  RetrievalItem,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { MongoClient, ObjectId } from 'mongodb';
import { DatabaseService } from '../database/database.service';
import {
  CreateBatchDto,
  CreateParentRetrievalDto,
  CreateRetrievalDto,
  CreateRetrievalItemDto,
  UpdateParentRetrievalDto,
  UpdateRetrievalDto,
} from './retrieval.dto';
import { IRetrievalRepository } from './retrieval.interface';
import { sanitizeForExport } from './sanitize.util';

/** BSON may store CVV as a number; coerce to string so XLSX emits text cells, not numeric. */
function normalizeExportCardInfo(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...raw };
  if ('cvv' in out && out.cvv != null && out.cvv !== '') {
    out.cvv = String(out.cvv);
  }
  return out;
}

function mapRawDocToRetrieval(doc: Record<string, unknown>): Partial<Retrieval> {
  const id = doc._id instanceof ObjectId ? doc._id.toString() : String(doc._id);
  return {
    id,
    name: doc.name != null ? String(doc.name) : undefined,
    portfolio_id: doc.portfolio_id != null ? String(doc.portfolio_id) : undefined,
    property_id: doc.property_id != null ? String(doc.property_id) : undefined,
    user_id: String(doc.user_id ?? ''),
    batch_id: doc.batch_id != null ? String(doc.batch_id) : undefined,
    parent_retrieval_id: String(doc.parent_retrieval_id ?? ''),
    posting_type: doc.posting_type as Retrieval['posting_type'],
    portfolio_name: doc.portfolio_name != null ? String(doc.portfolio_name) : undefined,
    property_name: String(doc.property_name ?? ''),
    ota_provider: (doc.OTA ?? doc.ota_provider) as Retrieval['ota_provider'],
    remaining_direct_billed: Number(doc.remaining_direct_billed) || 0,
    total_collectable: Number(doc.total_collectable) || 0,
    total_amount_confirmed: Number(doc.total_amount_confirmed) || 0,
    execution_type: String(doc.execution_type ?? ''),
    job_backoff_length_loading: Number(doc.job_backoff_length_loading) || 0,
    job_backoff_length_selector: Number(doc.job_backoff_length_selector) || 0,
    reservations: Array.isArray(doc.reservations) ? doc.reservations.map(String) : [],
    createdAt: doc.createdAt instanceof Date ? doc.createdAt : new Date(String(doc.createdAt ?? 0)),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt : new Date(String(doc.updatedAt ?? 0)),
  } as Partial<Retrieval>;
}

@Injectable()
export class RetrievalRepository implements IRetrievalRepository {
  constructor(
    private readonly prisma: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

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
      ota_provider,
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
        where.is_archived = false;
      }
    }

    // Handle ota_provider filter
    if (
      ota_provider !== undefined &&
      ota_provider !== null &&
      ota_provider !== ''
    ) {
      where.ota_provider = ota_provider;
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
    if (data.length === 0) {
      return;
    }

    // Remove duplicates from input array based on (retrieval_id, reservation_id)
    const uniqueDataMap = new Map<string, CreateRetrievalItemDto>();
    for (const item of data) {
      const key = `${item.retrieval_id}_${item.reservation_id || 'null'}`;
      if (!uniqueDataMap.has(key)) {
        uniqueDataMap.set(key, item);
      }
    }
    const uniqueData = Array.from(uniqueDataMap.values());

    // Check which records already exist in the database
    const existingRecords = await this.prisma.retrievalItem.findMany({
      where: {
        OR: uniqueData.map((item) => ({
          retrieval_id: item.retrieval_id,
          reservation_id: item.reservation_id || null,
        })),
      },
      select: {
        retrieval_id: true,
        reservation_id: true,
      },
    });

    // Create a set of existing (retrieval_id, reservation_id) combinations
    const existingKeys = new Set(
      existingRecords.map(
        (r) => `${r.retrieval_id}_${r.reservation_id || 'null'}`,
      ),
    );

    // Filter out records that already exist
    const newData = uniqueData.filter(
      (item) =>
        !existingKeys.has(
          `${item.retrieval_id}_${item.reservation_id || 'null'}`,
        ),
    );

    // Only insert new records
    if (newData.length > 0) {
      await this.prisma.retrievalItem.createMany({
        data: newData,
      });
    }
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
        where.is_archived = false;
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

  /**
   * Fetches retrieval items for export using the native MongoDB driver and sanitizes
   * all string fields. Use this for export to avoid Prisma "Failed to convert rust
   * String into napi string" when the DB contains invalid UTF-8 or problematic characters.
   */
  async findRetrievalItemsByParentRetrievalIdForExport(
    parentRetrievalId: string,
  ): Promise<(RetrievalItem & { retrieval: Retrieval })[]> {
    const url = this.configService.get<string>('DATABASE_URL');
    if (!url) {
      throw new Error('DATABASE_URL is not configured');
    }
    const client = new MongoClient(url);
    try {
      await client.connect();
      const db = client.db();
      const itemsColl = db.collection<Record<string, unknown>>('retrieval_items');
      const retrievalsColl =
        db.collection<Record<string, unknown>>('retrievals');

      // Prisma stores @db.ObjectId fields as BSON ObjectId in MongoDB; query with ObjectId so the filter matches
      const parentIdFilter = ObjectId.isValid(parentRetrievalId)
        ? new ObjectId(parentRetrievalId)
        : parentRetrievalId;
      const rawItems = await itemsColl
        .find({ parent_retrieval_id: parentIdFilter })
        .sort({ createdAt: 1 })
        .toArray();

      if (rawItems.length === 0) {
        return [];
      }

      const retrievalIds = [
        ...new Set(
          rawItems.map((doc) => {
            const rid = doc.retrieval_id;
            return rid instanceof ObjectId ? rid.toString() : String(rid ?? '');
          }),
        ),
      ].filter(Boolean);

      const retrievalObjectIds = retrievalIds
        .filter((id) => ObjectId.isValid(id))
        .map((id) => new ObjectId(id));
      const rawRetrievals =
        retrievalObjectIds.length > 0
          ? await retrievalsColl
              .find({ _id: { $in: retrievalObjectIds } })
              .toArray()
          : [];

      const retrievalMap = new Map<string, Retrieval>();
      for (const r of rawRetrievals) {
        const id = r._id instanceof ObjectId ? r._id.toString() : String(r._id);
        retrievalMap.set(id, mapRawDocToRetrieval(r) as Retrieval);
      }

      const toRetrievalItem = (
        doc: Record<string, unknown>,
      ): RetrievalItem & { retrieval: Retrieval } => {
        const id =
          doc._id instanceof ObjectId ? doc._id.toString() : String(doc._id);
        const retrievalId =
          doc.retrieval_id instanceof ObjectId
            ? doc.retrieval_id.toString()
            : String(doc.retrieval_id ?? '');
        const retrieval: Retrieval =
          retrievalMap.get(retrievalId) ?? ({} as Retrieval);

        return {
          id,
          retrieval_id: retrievalId,
          parent_retrieval_id: String(doc.parent_retrieval_id ?? ''),
          property_id: String(doc.property_id ?? ''),
          guest_name: String(doc.guest_name ?? ''),
          reservation_id: doc.reservation_id != null ? String(doc.reservation_id) : null,
          confirmation_number:
            doc.confirmation_number != null
              ? String(doc.confirmation_number)
              : null,
          check_in_date: doc.check_in_date instanceof Date ? doc.check_in_date : new Date(String(doc.check_in_date)),
          check_out_date: doc.check_out_date instanceof Date ? doc.check_out_date : new Date(String(doc.check_out_date)),
          room_type: String(doc.room_type ?? ''),
          booking_amount:
            typeof doc.booking_amount === 'number' ? doc.booking_amount : null,
          booked_date: doc.booked_date instanceof Date ? doc.booked_date : new Date(String(doc.booked_date)),
          has_card_info: Boolean(doc.has_card_info),
          card_info:
            doc.card_info && typeof doc.card_info === 'object'
              ? normalizeExportCardInfo(
                  doc.card_info as Record<string, unknown>,
                )
              : null,
          has_payment_info: Boolean(doc.has_payment_info),
          payment_info:
            doc.payment_info && typeof doc.payment_info === 'object'
              ? (doc.payment_info as Record<string, unknown>)
              : null,
          reservation_status: String(doc.reservation_status ?? ''),
          additional_text:
            doc.additional_text != null ? String(doc.additional_text) : null,
          createdAt: doc.createdAt instanceof Date ? doc.createdAt : new Date(String(doc.createdAt)),
          updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt : new Date(String(doc.updatedAt)),
          retrieval,
        } as RetrievalItem & { retrieval: Retrieval };
      };

      const items = rawItems.map((doc) => toRetrievalItem(doc));
      return sanitizeForExport(items) as (RetrievalItem & {
        retrieval: Retrieval;
      })[];
    } finally {
      await client.close();
    }
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
        where.is_archived = false;
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

  async updateParentRetrieval(
    id: string,
    data: UpdateParentRetrievalDto,
  ): Promise<ParentRetrieval> {
    return this.prisma.parentRetrieval.update({
      where: { id },
      data,
    });
  }

  async deleteRetrieval(id: string): Promise<void> {
    // First, delete all associated retrieval items
    await this.prisma.retrievalItem.deleteMany({
      where: { retrieval_id: id },
    });

    // Then delete the retrieval
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

  async bulkArchiveParentRetrievalsUpdate(
    parentRetrievalIds: string[],
    isArchived: boolean,
  ): Promise<{ count: number }> {
    try {
      // Update all parent retrievals with the is_archived status
      const result = await this.prisma.parentRetrieval.updateMany({
        where: {
          id: {
            in: parentRetrievalIds,
          },
        },
        data: {
          is_archived: isArchived,
        },
      });

      return result;
    } catch (error) {
      throw error;
    }
  }

  async bulkDeleteParentRetrievals(parentRetrievalIds: string[]): Promise<{
    deletedCount: number;
    deletedRetrievalsCount: number;
    deletedRetrievalItemsCount: number;
    deletedParentRetrievalIds: string[];
  }> {
    try {
      // First, verify which parent retrievals exist
      const existingParentRetrievals =
        await this.prisma.parentRetrieval.findMany({
          where: {
            id: {
              in: parentRetrievalIds,
            },
          },
          select: {
            id: true,
          },
        });

      const existingParentRetrievalIds = existingParentRetrievals.map(
        (pr) => pr.id,
      );

      if (existingParentRetrievalIds.length === 0) {
        return {
          deletedCount: 0,
          deletedRetrievalsCount: 0,
          deletedRetrievalItemsCount: 0,
          deletedParentRetrievalIds: [],
        };
      }

      // Get all retrievals for these parent retrievals
      const retrievals = await this.prisma.retrieval.findMany({
        where: {
          parent_retrieval_id: {
            in: existingParentRetrievalIds,
          },
        },
        select: {
          id: true,
        },
      });

      const retrievalIds = retrievals.map((r) => r.id);

      // Delete all retrieval items for these retrievals
      const retrievalItemsResult = await this.prisma.retrievalItem.deleteMany({
        where: {
          retrieval_id: {
            in: retrievalIds,
          },
        },
      });

      // Also delete retrieval items by parent_retrieval_id (in case some items are linked directly to parent)
      const parentRetrievalItemsResult =
        await this.prisma.retrievalItem.deleteMany({
          where: {
            parent_retrieval_id: {
              in: existingParentRetrievalIds,
            },
          },
        });

      const totalRetrievalItemsDeleted =
        retrievalItemsResult.count + parentRetrievalItemsResult.count;

      // Delete all retrievals for these parent retrievals
      const retrievalsResult = await this.prisma.retrieval.deleteMany({
        where: {
          parent_retrieval_id: {
            in: existingParentRetrievalIds,
          },
        },
      });

      // Finally, delete all parent retrievals
      const parentRetrievalsResult =
        await this.prisma.parentRetrieval.deleteMany({
          where: {
            id: {
              in: existingParentRetrievalIds,
            },
          },
        });

      return {
        deletedCount: parentRetrievalsResult.count,
        deletedRetrievalsCount: retrievalsResult.count,
        deletedRetrievalItemsCount: totalRetrievalItemsDeleted,
        deletedParentRetrievalIds: existingParentRetrievalIds,
      };
    } catch (error) {
      throw error;
    }
  }
}
