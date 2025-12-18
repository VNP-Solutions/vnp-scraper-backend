import {
  Batch,
  ParentRetrieval,
  Retrieval,
  RetrievalItem,
} from '@prisma/client';
import {
  CreateBatchDto,
  CreateParentRetrievalDto,
  CreateRetrievalDto,
  CreateRetrievalItemDto,
  UpdateParentRetrievalDto,
  UpdateRetrievalDto,
} from './retrieval.dto';

export interface IRetrievalService {
  uploadRetrievalExcel(
    file: Express.Multer.File,
    userId: string,
  ): Promise<{
    parentRetrieval: ParentRetrieval;
    retrievals: Retrieval[];
    successCount: number;
    failedCount: number;
    failedHotelIds: string[];
    retrievalItemsCount: number;
  }>;
  exportRetrievalItemsToExcel(parentRetrievalId: string): Promise<Buffer>;
  createParentRetrieval(
    data: CreateParentRetrievalDto,
  ): Promise<ParentRetrieval>;
  getAllParentRetrievals(
    query: Record<string, any>,
  ): Promise<{ data: ParentRetrieval[]; metadata: any }>;
  createRetrieval(data: CreateRetrievalDto): Promise<Retrieval>;
  createRetrievalItem(data: CreateRetrievalItemDto): Promise<RetrievalItem>;
  getAllRetrievals(
    query: Record<string, any>,
  ): Promise<{ data: Retrieval[]; metadata: any }>;
  getRetrievalsByParentRetrievalId(
    parentRetrievalId: string,
    query: Record<string, any>,
  ): Promise<{ data: Retrieval[]; metadata: any }>;
  getRetrievalById(id: string): Promise<Retrieval>;
  getParentRetrievalById(id: string): Promise<ParentRetrieval>;
  getRetrievalItemsByRetrievalId(
    retrievalId: string,
    query: Record<string, any>,
  ): Promise<{ data: RetrievalItem[]; metadata: any }>;
  updateRetrieval(id: string, data: UpdateRetrievalDto): Promise<Retrieval>;
  updateParentRetrieval(
    id: string,
    data: UpdateParentRetrievalDto,
  ): Promise<ParentRetrieval>;
  deleteRetrieval(id: string): Promise<void>;
  deleteParentRetrieval(id: string): Promise<void>;
  createBatch(data: CreateBatchDto): Promise<Batch>;
  findBatchByName(name: string): Promise<Batch | null>;
  bulkBatchUpdate(
    retrievalIds: string[],
    batchId: string,
  ): Promise<{ updatedCount: number; batch_id: string }>;
  bulkArchiveParentRetrievals(
    parentRetrievalIds: string[],
    status: boolean,
  ): Promise<{ updatedCount: number; status: boolean }>;
  bulkDeleteParentRetrievals(
    parentRetrievalIds: string[],
  ): Promise<{
    deletedCount: number;
    deletedRetrievalsCount: number;
    deletedRetrievalItemsCount: number;
    deletedParentRetrievalIds: string[];
  }>;
}

export interface IRetrievalRepository {
  createParentRetrieval(
    data: CreateParentRetrievalDto,
  ): Promise<ParentRetrieval>;
  findAllParentRetrievals(
    query: Record<string, any>,
  ): Promise<{ data: ParentRetrieval[]; metadata: any }>;
  createRetrieval(data: CreateRetrievalDto): Promise<Retrieval>;
  createRetrievalItem(data: CreateRetrievalItemDto): Promise<RetrievalItem>;
  findAllRetrievals(
    query: Record<string, any>,
  ): Promise<{ data: Retrieval[]; metadata: any }>;
  findRetrievalsByParentRetrievalId(
    parentRetrievalId: string,
    query: Record<string, any>,
  ): Promise<{ data: Retrieval[]; metadata: any }>;
  findRetrievalById(id: string): Promise<Retrieval | null>;
  findParentRetrievalById(id: string): Promise<ParentRetrieval | null>;
  findRetrievalItemsByParentRetrievalId(
    parentRetrievalId: string,
  ): Promise<RetrievalItem[]>;
  findRetrievalItemsByRetrievalId(
    retrievalId: string,
    query: Record<string, any>,
  ): Promise<{ data: RetrievalItem[]; metadata: any }>;
  updateRetrieval(id: string, data: UpdateRetrievalDto): Promise<Retrieval>;
  updateParentRetrieval(
    id: string,
    data: UpdateParentRetrievalDto,
  ): Promise<ParentRetrieval>;
  deleteRetrieval(id: string): Promise<void>;
  deleteParentRetrieval(id: string): Promise<void>;
  createManyRetrievalItems(data: CreateRetrievalItemDto[]): Promise<void>;
  createBatch(data: CreateBatchDto): Promise<Batch>;
  findBatchByName(name: string): Promise<Batch | null>;
  findBatchById(id: string): Promise<Batch | null>;
  bulkBatchUpdate(
    retrievalIds: string[],
    batchId: string,
  ): Promise<{ count: number }>;
  bulkArchiveParentRetrievalsUpdate(
    parentRetrievalIds: string[],
    isArchived: boolean,
  ): Promise<{ count: number }>;
  bulkDeleteParentRetrievals(
    parentRetrievalIds: string[],
  ): Promise<{
    deletedCount: number;
    deletedRetrievalsCount: number;
    deletedRetrievalItemsCount: number;
    deletedParentRetrievalIds: string[];
  }>;
}
