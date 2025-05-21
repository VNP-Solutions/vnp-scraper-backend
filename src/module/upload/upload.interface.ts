import { File } from '@prisma/client';
import { CreateFileDto, UpdateFileDto } from './upload.dto';

export interface IUploadRepository {
  create(data: CreateFileDto): Promise<File>;
  findAll(): Promise<File[]>;
  findById(id: string): Promise<File>;
  update(id: string, data: UpdateFileDto): Promise<File>;
  delete(id: string): Promise<File>;
}

export interface IUploadService {
  uploadFileToS3(file: Express.Multer.File): Promise<{ url: string }>;
  uploadFileToDb(file: Express.Multer.File): Promise<File>;
  getAllFiles(): Promise<File[]>;
  getFileById(id: string): Promise<File>;
  updateFile(id: string, file: Express.Multer.File): Promise<File>;
  deleteFileFromS3AndDb(id: string): Promise<void>;
  deleteFileFromS3(url: string): Promise<void>;
}