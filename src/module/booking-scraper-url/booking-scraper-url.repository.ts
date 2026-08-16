import { Injectable, Logger } from '@nestjs/common';
import { BookingScraperUrl } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { IBookingScraperUrlRepository } from './booking-scraper-url.interface';

@Injectable()
export class BookingScraperUrlRepository implements IBookingScraperUrlRepository {
  private readonly logger = new Logger(BookingScraperUrlRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async create(data: { url: string }): Promise<BookingScraperUrl> {
    try {
      return await this.db.bookingScraperUrl.create({
        data: { url: data.url },
      });
    } catch (error) {
      this.logger.error('Error creating booking scraper URL:', error);
      throw error;
    }
  }

  async findAll(filters?: {
    search?: string;
    page?: number;
    limit?: number;
    order?: 'asc' | 'desc';
  }): Promise<{
    items: BookingScraperUrl[];
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

      const where: any = {};

      if (filters?.search) {
        const searchTerm = filters.search.toString().trim();
        const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(searchTerm);

        where.OR = [
          ...(isValidObjectId ? [{ id: searchTerm }] : []),
          { url: { contains: searchTerm, mode: 'insensitive' } },
        ];
      }

      const [items, totalDocuments] = await Promise.all([
        this.db.bookingScraperUrl.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: order },
        }),
        this.db.bookingScraperUrl.count({ where }),
      ]);

      return {
        items,
        totalDocuments,
        currentPage: page,
        totalPage: Math.ceil(totalDocuments / limit),
        limit,
      };
    } catch (error) {
      this.logger.error('Error finding booking scraper URLs:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<BookingScraperUrl | null> {
    try {
      return await this.db.bookingScraperUrl.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(`Error finding booking scraper URL by id ${id}:`, error);
      throw error;
    }
  }

  async findByUrl(url: string): Promise<BookingScraperUrl | null> {
    try {
      return await this.db.bookingScraperUrl.findFirst({
        where: { url },
      });
    } catch (error) {
      this.logger.error(`Error finding booking scraper URL by url:`, error);
      throw error;
    }
  }

  async update(id: string, data: { url: string }): Promise<BookingScraperUrl> {
    try {
      return await this.db.bookingScraperUrl.update({
        where: { id },
        data,
      });
    } catch (error) {
      this.logger.error(`Error updating booking scraper URL ${id}:`, error);
      throw error;
    }
  }

  async delete(id: string): Promise<BookingScraperUrl> {
    try {
      return await this.db.bookingScraperUrl.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error(`Error deleting booking scraper URL ${id}:`, error);
      throw error;
    }
  }

  async bulkDelete(ids: string[]): Promise<number> {
    try {
      const result = await this.db.bookingScraperUrl.deleteMany({
        where: { id: { in: ids } },
      });

      return result.count;
    } catch (error) {
      this.logger.error('Error bulk deleting booking scraper URLs:', error);
      throw error;
    }
  }
}
