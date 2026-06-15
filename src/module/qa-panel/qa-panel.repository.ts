import { Injectable, Logger } from '@nestjs/common';
import { Prisma, QaPanel, QaPanelStatus } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { IQaPanelRepository } from './qa-panel.interface';
import { QaPanelFailedReasonType } from './qa-panel.validation';

@Injectable()
export class QaPanelRepository implements IQaPanelRepository {
  private readonly logger = new Logger(QaPanelRepository.name);

  constructor(private readonly db: DatabaseService) {}

  private toFailedReasons(
    failedReasons?: QaPanelFailedReasonType[],
  ): Prisma.QaPanelFailedReasonCreateInput[] {
    return (failedReasons ?? []).map(({ row_number, reason }) => ({
      row_number,
      reason,
    }));
  }

  async create(data: {
    file_url: string;
    file_name: string;
    status: QaPanelStatus;
    failed_reasons?: QaPanelFailedReasonType[];
  }): Promise<QaPanel> {
    try {
      return await this.db.qaPanel.create({
        data: {
          file_url: data.file_url,
          file_name: data.file_name,
          status: data.status,
          failed_reasons: this.toFailedReasons(data.failed_reasons),
        },
      });
    } catch (error) {
      this.logger.error('Error creating QA panel record:', error);
      throw error;
    }
  }

  async findAll(filters?: {
    search?: string;
    status?: QaPanelStatus;
    page?: number;
    limit?: number;
    order?: 'asc' | 'desc';
  }): Promise<{
    qaPanels: QaPanel[];
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

      const where: Record<string, unknown> = {};

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

      const [qaPanels, totalDocuments] = await Promise.all([
        this.db.qaPanel.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: order },
        }),
        this.db.qaPanel.count({ where }),
      ]);

      return {
        qaPanels,
        totalDocuments,
        currentPage: page,
        totalPage: Math.ceil(totalDocuments / limit) || 1,
        limit,
      };
    } catch (error) {
      this.logger.error('Error finding QA panels:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<QaPanel | null> {
    try {
      return await this.db.qaPanel.findUnique({ where: { id } });
    } catch (error) {
      this.logger.error(`Error finding QA panel by ID ${id}:`, error);
      throw error;
    }
  }

  async update(
    id: string,
    data: {
      file_url?: string;
      file_name?: string;
      status?: QaPanelStatus;
      failed_reasons?: QaPanelFailedReasonType[];
    },
  ): Promise<QaPanel> {
    try {
      const updateData: Prisma.QaPanelUpdateInput = {
        ...(data.file_url !== undefined ? { file_url: data.file_url } : {}),
        ...(data.file_name !== undefined ? { file_name: data.file_name } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.failed_reasons !== undefined
          ? { failed_reasons: this.toFailedReasons(data.failed_reasons) }
          : {}),
      };

      return await this.db.qaPanel.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      this.logger.error(`Error updating QA panel ${id}:`, error);
      throw error;
    }
  }

  async delete(id: string): Promise<QaPanel> {
    try {
      return await this.db.qaPanel.delete({ where: { id } });
    } catch (error) {
      this.logger.error(`Error deleting QA panel ${id}:`, error);
      throw error;
    }
  }

  async bulkDelete(ids: string[]): Promise<number> {
    try {
      const result = await this.db.qaPanel.deleteMany({
        where: { id: { in: ids } },
      });
      return result.count;
    } catch (error) {
      this.logger.error('Error bulk deleting QA panels:', error);
      throw error;
    }
  }
}
