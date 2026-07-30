import { BookingScraperUrl } from '@prisma/client';

export interface IBookingScraperUrlRepository {
  create(data: { url: string }): Promise<BookingScraperUrl>;

  findAll(filters?: {
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
  }>;

  findById(id: string): Promise<BookingScraperUrl | null>;

  findByUrl(url: string): Promise<BookingScraperUrl | null>;

  update(id: string, data: { url: string }): Promise<BookingScraperUrl>;

  delete(id: string): Promise<BookingScraperUrl>;

  bulkDelete(ids: string[]): Promise<number>;
}

export interface IBookingScraperUrlService {
  create(data: { url: string }): Promise<BookingScraperUrl>;

  findAll(filters?: {
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
  }>;

  findById(id: string): Promise<BookingScraperUrl>;

  update(id: string, data: { url: string }): Promise<BookingScraperUrl>;

  delete(id: string): Promise<{ deletedCount: number; deletedId: string }>;

  bulkDelete(ids: string[]): Promise<{
    deletedCount: number;
    deletedIds: string[];
  }>;

  normalizeUrl(url: string): string;

  getNormalizedUrlById(id: string): Promise<string>;
}
