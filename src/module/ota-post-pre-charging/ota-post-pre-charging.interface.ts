import { OtaPostPreCharging } from '@prisma/client';

export interface IOtaPostPreChargingRepository {
  create(data: {
    user_id: string;
    original_file_url: string;
    converted_file_url?: string;
    file_name: string;
    row_count: number;
    delivery: 'Response' | 'Email';
    status: 'Processing' | 'Completed' | 'Failed';
    error_message?: string;
  }): Promise<OtaPostPreCharging>;

  findAll(filters?: {
    user_id?: string;
    page?: number;
    limit?: number;
    order?: 'asc' | 'desc';
  }): Promise<{
    records: OtaPostPreCharging[];
    totalDocuments: number;
    currentPage: number;
    totalPage: number;
    limit: number;
  }>;

  findById(id: string): Promise<OtaPostPreCharging | null>;

  update(
    id: string,
    data: {
      converted_file_url?: string;
      row_count?: number;
      delivery?: 'Response' | 'Email';
      status?: 'Processing' | 'Completed' | 'Failed';
      error_message?: string | null;
    },
  ): Promise<OtaPostPreCharging>;

  delete(id: string): Promise<OtaPostPreCharging>;

  bulkDelete(ids: string[]): Promise<number>;
}

export interface IOtaPostPreChargingService {
  convertTemplate(
    file: Express.Multer.File,
    user: { userId: string; email: string; name?: string | null },
  ): Promise<
    | {
        mode: 'download';
        buffer: Buffer;
        fileName: string;
        recordId: string;
        rowCount: number;
      }
    | {
        mode: 'queued';
        recordId: string;
        estimatedRowCount: number;
        email: string;
      }
  >;

  findAllRecords(filters?: {
    user_id?: string;
    page?: number;
    limit?: number;
    order?: 'asc' | 'desc';
  }): ReturnType<IOtaPostPreChargingRepository['findAll']>;

  findRecordById(id: string): Promise<OtaPostPreCharging>;

  deleteRecord(
    id: string,
    userId?: string,
  ): Promise<{ deletedCount: number; deletedId: string }>;

  bulkDeleteRecords(
    ids: string[],
    userId?: string,
  ): Promise<{ deletedCount: number; deletedIds: string[] }>;
}
