import { QaPanel, QaPanelStatus } from '@prisma/client';
import {
  CreateQaPanelType,
  QaPanelFailedReasonType,
  QaPanelImportCallbackType,
  UpdateQaPanelType,
} from './qa-panel.validation';

export interface IQaPanelRepository {
  create(data: {
    file_url: string;
    file_name: string;
    status: QaPanelStatus;
    failed_reasons?: QaPanelFailedReasonType[];
  }): Promise<QaPanel>;

  findAll(filters?: {
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
  }>;

  findById(id: string): Promise<QaPanel | null>;

  update(
    id: string,
    data: {
      file_url?: string;
      file_name?: string;
      status?: QaPanelStatus;
      failed_reasons?: QaPanelFailedReasonType[];
    },
  ): Promise<QaPanel>;

  delete(id: string): Promise<QaPanel>;

  bulkDelete(ids: string[]): Promise<number>;
}

export interface IQaPanelService {
  createQaPanel(data: CreateQaPanelType): Promise<QaPanel>;

  findAllQaPanels(filters?: {
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
  }>;

  findQaPanelById(id: string): Promise<QaPanel>;

  updateQaPanel(id: string, data: UpdateQaPanelType): Promise<QaPanel>;

  deleteQaPanel(id: string): Promise<{ deletedCount: number; deletedId: string }>;

  bulkDeleteQaPanels(ids: string[]): Promise<{
    deletedCount: number;
    deletedIds: string[];
  }>;

  uploadAndProcess(file: Express.Multer.File): Promise<unknown>;

  processImportCallback(data: QaPanelImportCallbackType): Promise<QaPanel>;

  generateCommunicationToken(): Promise<{
    token: string;
    expiresIn: string;
  }>;
}
