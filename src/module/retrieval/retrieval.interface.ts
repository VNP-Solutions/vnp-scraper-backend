import { ParentRetrieval, Retrieval, RetrievalItem } from '@prisma/client';
import {
  CreateParentRetrievalDto,
  CreateRetrievalDto,
  CreateRetrievalItemDto,
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
  getAllParentRetrievals(): Promise<ParentRetrieval[]>;
  createRetrieval(data: CreateRetrievalDto): Promise<Retrieval>;
  createRetrievalItem(data: CreateRetrievalItemDto): Promise<RetrievalItem>;
  getAllRetrievals(
    query: Record<string, any>,
  ): Promise<{ data: Retrieval[]; metadata: any }>;
  getRetrievalsByParentRetrievalId(
    parentRetrievalId: string,
  ): Promise<Retrieval[]>;
  getRetrievalById(id: string): Promise<Retrieval>;
  getParentRetrievalById(id: string): Promise<ParentRetrieval>;
  updateRetrieval(id: string, data: UpdateRetrievalDto): Promise<Retrieval>;
  deleteRetrieval(id: string): Promise<void>;
  deleteParentRetrieval(id: string): Promise<void>;
}

export interface IRetrievalRepository {
  createParentRetrieval(
    data: CreateParentRetrievalDto,
  ): Promise<ParentRetrieval>;
  findAllParentRetrievals(): Promise<ParentRetrieval[]>;
  createRetrieval(data: CreateRetrievalDto): Promise<Retrieval>;
  createRetrievalItem(data: CreateRetrievalItemDto): Promise<RetrievalItem>;
  findAllRetrievals(
    query: Record<string, any>,
  ): Promise<{ data: Retrieval[]; metadata: any }>;
  findRetrievalsByParentRetrievalId(
    parentRetrievalId: string,
  ): Promise<Retrieval[]>;
  findRetrievalById(id: string): Promise<Retrieval | null>;
  findParentRetrievalById(id: string): Promise<ParentRetrieval | null>;
  findRetrievalItemsByParentRetrievalId(
    parentRetrievalId: string,
  ): Promise<RetrievalItem[]>;
  updateRetrieval(id: string, data: UpdateRetrievalDto): Promise<Retrieval>;
  deleteRetrieval(id: string): Promise<void>;
  deleteParentRetrieval(id: string): Promise<void>;
  createManyRetrievalItems(data: CreateRetrievalItemDto[]): Promise<void>;
}
