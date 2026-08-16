import { QaPanelOtaPost, QaPanelStatus } from '@prisma/client';
import {
  CreateQaPanelOtaPostType,
  QaPanelOtaPostFailedReasonType,
  QaPanelOtaPostImportCallbackType,
  UpdateQaPanelOtaPostType,
} from './qa-panel-ota-post.validation';

export interface IQaPanelOtaPostRepository {
  create(data: {
    file_url: string;
    converted_file_url?: string;
    file_name: string;
    status: QaPanelStatus;
    failed_reasons?: QaPanelOtaPostFailedReasonType[];
  }): Promise<QaPanelOtaPost>;

  findAll(filters?: {
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
  }>;

  findById(id: string): Promise<QaPanelOtaPost | null>;

  update(
    id: string,
    data: {
      file_url?: string;
      converted_file_url?: string;
      file_name?: string;
      status?: QaPanelStatus;
      failed_reasons?: QaPanelOtaPostFailedReasonType[];
    },
  ): Promise<QaPanelOtaPost>;

  delete(id: string): Promise<QaPanelOtaPost>;

  bulkDelete(ids: string[]): Promise<number>;
}

export interface IQaPanelOtaPostService {
  createQaPanel(data: CreateQaPanelOtaPostType): Promise<QaPanelOtaPost>;

  findAllQaPanels(filters?: {
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
  }>;

  findQaPanelById(id: string): Promise<QaPanelOtaPost>;

  updateQaPanel(
    id: string,
    data: UpdateQaPanelOtaPostType,
  ): Promise<QaPanelOtaPost>;

  deleteQaPanel(
    id: string,
  ): Promise<{ deletedCount: number; deletedId: string }>;

  bulkDeleteQaPanels(ids: string[]): Promise<{
    deletedCount: number;
    deletedIds: string[];
  }>;

  uploadAndProcess(file: Express.Multer.File, email: string): Promise<unknown>;

  processImportCallback(
    data: QaPanelOtaPostImportCallbackType,
  ): Promise<QaPanelOtaPost>;

  generateCommunicationToken(): Promise<{
    token: string;
    expiresIn: string;
  }>;
}
