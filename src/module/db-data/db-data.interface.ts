import { DbData } from '@prisma/client';

export interface IDbDataRepository {
  findAll(query?: Record<string, any>): Promise<{
    data: DbData[];
    metadata: any;
  }>;
  findById(id: string): Promise<DbData | null>;
  delete(id: string): Promise<DbData | null>;
}

export interface IDbDataService {
  getAllDbData(query?: Record<string, any>): Promise<{
    data: DbData[];
    metadata: any;
  }>;
  getDbDataById(id: string): Promise<DbData | null>;
  deleteDbData(id: string): Promise<void>;
}
