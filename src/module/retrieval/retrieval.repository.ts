import { Injectable } from '@nestjs/common';
import { ParentRetrieval, Retrieval, RetrievalItem } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import {
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

  async findAllParentRetrievals(): Promise<ParentRetrieval[]> {
    return this.prisma.parentRetrieval.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: 'desc',
      },
    });
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

  async findRetrievalsByParentRetrievalId(
    parentRetrievalId: string,
  ): Promise<Retrieval[]> {
    return this.prisma.retrieval.findMany({
      where: {
        parent_retrieval_id: parentRetrievalId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
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
    await this.prisma.parentRetrieval.delete({
      where: { id },
    });
  }
}
