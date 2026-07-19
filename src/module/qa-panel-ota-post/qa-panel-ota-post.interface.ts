import { QaPanel, QaPanelStatus } from '@prisma/client';
import {
  CreateQaPanelOtaPostType,
  QaPanelOtaPostFailedReasonType,
  QaPanelOtaPostImportCallbackType,
  UpdateQaPanelOtaPostType,
} from './qa-panel-ota-post.validation';

export interface IQaPanelOtaPostRepository {
  create(data: {
    file_url: string;
    file_name: string;
    status: QaPanelStatus;
    failed_reasons?: QaPanelOtaPostFailedReasonType[];
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
      failed_reasons?: QaPanelOtaPostFailedReasonType[];
    },
  ): Promise<QaPanel>;

  delete(id: string): Promise<QaPanel>;

  bulkDelete(ids: string[]): Promise<number>;
}

export interface IQaPanelOtaPostService {
  createQaPanel(data: CreateQaPanelOtaPostType): Promise<QaPanel>;

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

  updateQaPanel(id: string, data: UpdateQaPanelOtaPostType): Promise<QaPanel>;

  deleteQaPanel(id: string): Promise<{ deletedCount: number; deletedId: string }>;

  bulkDeleteQaPanels(ids: string[]): Promise<{
    deletedCount: number;
    deletedIds: string[];
  }>;

  uploadAndProcess(file: Express.Multer.File, email: string): Promise<unknown>;

  processImportCallback(data: QaPanelOtaPostImportCallbackType): Promise<QaPanel>;

  generateCommunicationToken(): Promise<{
    token: string;
    expiresIn: string;
  }>;
}
