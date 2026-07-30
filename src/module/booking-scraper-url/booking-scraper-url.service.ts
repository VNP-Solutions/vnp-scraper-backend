import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingScraperUrl } from '@prisma/client';
import { IBookingScraperUrlService } from './booking-scraper-url.interface';
import { BookingScraperUrlRepository } from './booking-scraper-url.repository';

@Injectable()
export class BookingScraperUrlService implements IBookingScraperUrlService {
  private readonly logger = new Logger(BookingScraperUrlService.name);

  constructor(
    private readonly repository: BookingScraperUrlRepository,
    private readonly configService: ConfigService,
  ) {}

  async create(data: { url: string }): Promise<BookingScraperUrl> {
    try {
      const existing = await this.repository.findByUrl(data.url);
      if (existing) {
        throw new ConflictException(
          `Booking scraper URL "${data.url}" already exists`,
        );
      }

      const item = await this.repository.create(data);
      this.logger.log(`Booking scraper URL created (ID: ${item.id})`);
      return item;
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
      return await this.repository.findAll(filters);
    } catch (error) {
      this.logger.error('Error finding booking scraper URLs:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<BookingScraperUrl> {
    try {
      const item = await this.repository.findById(id);
      if (!item) {
        throw new NotFoundException(
          `Booking scraper URL with ID ${id} not found`,
        );
      }
      return item;
    } catch (error) {
      this.logger.error(`Error finding booking scraper URL by ID ${id}:`, error);
      throw error;
    }
  }

  async update(id: string, data: { url: string }): Promise<BookingScraperUrl> {
    try {
      const existing = await this.repository.findById(id);
      if (!existing) {
        throw new NotFoundException(
          `Booking scraper URL with ID ${id} not found`,
        );
      }

      if (data.url !== existing.url) {
        const duplicate = await this.repository.findByUrl(data.url);
        if (duplicate) {
          throw new ConflictException(
            `Booking scraper URL "${data.url}" already exists`,
          );
        }
      }

      const updated = await this.repository.update(id, data);
      this.logger.log(`Booking scraper URL updated (ID: ${id})`);
      return updated;
    } catch (error) {
      this.logger.error(`Error updating booking scraper URL ${id}:`, error);
      throw error;
    }
  }

  async delete(
    id: string,
  ): Promise<{ deletedCount: number; deletedId: string }> {
    try {
      const item = await this.repository.findById(id);
      if (!item) {
        throw new NotFoundException(
          `Booking scraper URL with ID ${id} not found`,
        );
      }

      await this.repository.delete(id);
      this.logger.log(`Booking scraper URL deleted (ID: ${id})`);

      return {
        deletedCount: 1,
        deletedId: id,
      };
    } catch (error) {
      this.logger.error(`Error deleting booking scraper URL ${id}:`, error);
      throw error;
    }
  }

  async bulkDelete(ids: string[]): Promise<{
    deletedCount: number;
    deletedIds: string[];
  }> {
    try {
      if (!ids || ids.length === 0) {
        throw new BadRequestException('No IDs provided for deletion');
      }

      const deletedCount = await this.repository.bulkDelete(ids);
      this.logger.log(`Bulk deleted ${deletedCount} booking scraper URL(s)`);

      return {
        deletedCount,
        deletedIds: ids.slice(0, deletedCount),
      };
    } catch (error) {
      this.logger.error('Error bulk deleting booking scraper URLs:', error);
      throw error;
    }
  }

  normalizeUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    const isProduction = this.configService.get('NODE_ENV') === 'production';
    const defaultProtocol = isProduction ? 'https' : 'http';
    return `${defaultProtocol}://${url}`;
  }

  async getNormalizedUrlById(id: string): Promise<string> {
    const record = await this.findById(id);
    return this.normalizeUrl(record.url);
  }
}
