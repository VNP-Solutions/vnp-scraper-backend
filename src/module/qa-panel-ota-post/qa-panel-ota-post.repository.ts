import { Injectable, Logger } from '@nestjs/common';
import { Prisma, QaPanelOtaPost, QaPanelStatus } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { IQaPanelOtaPostRepository } from './qa-panel-ota-post.interface';
import { QaPanelOtaPostFailedReasonType } from './qa-panel-ota-post.validation';

@Injectable()
export class QaPanelOtaPostRepository implements IQaPanelOtaPostRepository {
  private readonly logger = new Logger(QaPanelOtaPostRepository.name);

  constructor(private readonly db: DatabaseService) {}

  private toFailedReasons(
    failedReasons?: QaPanelOtaPostFailedReasonType[],
  ): Prisma.QaPanelFailedReasonCreateInput[] {
    return (failedReasons ?? []).map(({ row_number, reason }) => ({
      row_number,
      reason,
    }));
  }

  async create(data: {
    file_url: string;
    converted_file_url?: string;
    file_name: string;
    status: QaPanelStatus;
    failed_reasons?: QaPanelOtaPostFailedReasonType[];
  }): Promise<QaPanelOtaPost> {
    try {
      return await this.db.qaPanelOtaPost.create({
        data: {
          file_url: data.file_url,
          converted_file_url: data.converted_file_url,
          file_name: data.file_name,
          status: data.status,
          failed_reasons: this.toFailedReasons(data.failed_reasons),
        },
      });
    } catch (error) {
      this.logger.error('Error creating QA panel OTA post record:', error);
      throw error;
    }
  }

  private buildWhereClause(filters?: {
    search?: string;
    status?: QaPanelStatus;
  }): Prisma.QaPanelOtaPostWhereInput {
    const where: Prisma.QaPanelOtaPostWhereInput = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.search) {
      const searchTerm = filters.search.toString().trim();
      const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(searchTerm);

      where.OR = [
        { file_name: { contains: searchTerm, mode: 'insensitive' } },
        { file_url: { contains: searchTerm, mode: 'insensitive' } },
        ...(isValidObjectId ? [{ id: searchTerm }] : []),
      ];
    }

    return where;
  }

  async findAll(filters?: {
    search?: string;
    status?: QaPanelStatus;
    page?: number;
    limit?: number;
    order?: 'asc' | 'desc';
  }): Promise<{
    qaPanels: QaPanelOtaPost[];
    totalDocuments: number;
    currentPage: number;
    totalPage: number;
    limit: number;
  }> {
    try {
      const page = filters?.page || 1;
      const limit = filters?.limit || 10;
      const skip = (page - 1) * limit;
      const order = filters?.order || 'desc';

      const where = this.buildWhereClause(filters);

      const [qaPanels, totalDocuments] = await Promise.all([
        this.db.qaPanelOtaPost.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: order },
        }),
        this.db.qaPanelOtaPost.count({ where }),
      ]);

      return {
        qaPanels,
        totalDocuments,
        currentPage: page,
        totalPage: Math.ceil(totalDocuments / limit) || 1,
        limit,
      };
    } catch (error) {
      this.logger.error('Error finding QA panel OTA post records:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<QaPanelOtaPost | null> {
    try {
      return await this.db.qaPanelOtaPost.findUnique({ where: { id } });
    } catch (error) {
      this.logger.error(`Error finding QA panel OTA post by ID ${id}:`, error);
      throw error;
    }
  }

  async update(
    id: string,
    data: {
      file_url?: string;
      converted_file_url?: string;
      file_name?: string;
      status?: QaPanelStatus;
      failed_reasons?: QaPanelOtaPostFailedReasonType[];
    },
  ): Promise<QaPanelOtaPost> {
    try {
      const updateData: Prisma.QaPanelOtaPostUpdateInput = {
        ...(data.file_url !== undefined ? { file_url: data.file_url } : {}),
        ...(data.converted_file_url !== undefined
          ? { converted_file_url: data.converted_file_url }
          : {}),
        ...(data.file_name !== undefined ? { file_name: data.file_name } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.failed_reasons !== undefined
          ? { failed_reasons: this.toFailedReasons(data.failed_reasons) }
          : {}),
      };

      return await this.db.qaPanelOtaPost.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      this.logger.error(`Error updating QA panel OTA post ${id}:`, error);
      throw error;
    }
  }

  async delete(id: string): Promise<QaPanelOtaPost> {
    try {
      return await this.db.qaPanelOtaPost.delete({ where: { id } });
    } catch (error) {
      this.logger.error(`Error deleting QA panel OTA post ${id}:`, error);
      throw error;
    }
  }

  async bulkDelete(ids: string[]): Promise<number> {
    try {
      const result = await this.db.qaPanelOtaPost.deleteMany({
        where: { id: { in: ids } },
      });
      return result.count;
    } catch (error) {
      this.logger.error('Error bulk deleting QA panel OTA post records:', error);
      throw error;
    }
  }
}
