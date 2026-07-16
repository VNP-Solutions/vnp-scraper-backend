import { Injectable, Logger } from '@nestjs/common';
import {
  OtaPostPreCharging,
  OtaPostPreChargingDelivery,
  OtaPostPreChargingStatus,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { IOtaPostPreChargingRepository } from './ota-post-pre-charging.interface';

@Injectable()
export class OtaPostPreChargingRepository implements IOtaPostPreChargingRepository {
  private readonly logger = new Logger(OtaPostPreChargingRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async create(data: {
    user_id: string;
    original_file_url: string;
    converted_file_url?: string;
    file_name: string;
    row_count: number;
    delivery: OtaPostPreChargingDelivery;
    status: OtaPostPreChargingStatus;
    error_message?: string;
  }): Promise<OtaPostPreCharging> {
    try {
      return await this.db.otaPostPreCharging.create({ data });
    } catch (error) {
      this.logger.error('Error creating OTA post pre-charging record:', error);
      throw error;
    }
  }

  async findAll(filters?: {
    user_id?: string;
    page?: number;
    limit?: number;
    order?: 'asc' | 'desc';
  }) {
    try {
      const page = filters?.page || 1;
      const limit = filters?.limit || 10;
      const skip = (page - 1) * limit;
      const order = filters?.order || 'desc';
      const where: Prisma.OtaPostPreChargingWhereInput = {};

      if (filters?.user_id) {
        where.user_id = filters.user_id;
      }

      const [records, totalDocuments] = await Promise.all([
        this.db.otaPostPreCharging.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: order },
        }),
        this.db.otaPostPreCharging.count({ where }),
      ]);

      return {
        records,
        totalDocuments,
        currentPage: page,
        totalPage: Math.ceil(totalDocuments / limit) || 1,
        limit,
      };
    } catch (error) {
      this.logger.error('Error finding OTA post pre-charging records:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<OtaPostPreCharging | null> {
    try {
      return await this.db.otaPostPreCharging.findUnique({ where: { id } });
    } catch (error) {
      this.logger.error(
        `Error finding OTA post pre-charging record by ID ${id}:`,
        error,
      );
      throw error;
    }
  }

  async update(
    id: string,
    data: {
      converted_file_url?: string;
      row_count?: number;
      delivery?: OtaPostPreChargingDelivery;
      status?: OtaPostPreChargingStatus;
      error_message?: string | null;
    },
  ): Promise<OtaPostPreCharging> {
    try {
      const updateData: Prisma.OtaPostPreChargingUpdateInput = {
        ...(data.converted_file_url !== undefined
          ? { converted_file_url: data.converted_file_url }
          : {}),
        ...(data.row_count !== undefined ? { row_count: data.row_count } : {}),
        ...(data.delivery !== undefined ? { delivery: data.delivery } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.error_message !== undefined
          ? { error_message: data.error_message }
          : {}),
      };

      return await this.db.otaPostPreCharging.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      this.logger.error(
        `Error updating OTA post pre-charging record ${id}:`,
        error,
      );
      throw error;
    }
  }
}
