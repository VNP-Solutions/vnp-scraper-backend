import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IUploadService } from './upload.interface';
import { S3UploadService } from '../../common/utils/s3-upload.util';
import { File } from '@prisma/client';
import { IUploadRepository } from './upload.interface';

@Injectable()
export class UploadService implements IUploadService {
  constructor(
    @Inject('IUploadRepository')
    private readonly repository: IUploadRepository,
    private readonly s3UploadService: S3UploadService,
  ) {}

  async uploadFileToS3(file: Express.Multer.File): Promise<{ url: string }> {
    const url = await this.s3UploadService.uploadFile(file);
    return { url };
  }

  async uploadFileToDb(file: Express.Multer.File): Promise<File> {
    const url = await this.s3UploadService.uploadFile(file);
    return this.repository.create({
      url,
      originalName: file.originalname,
    });
  }

  async getAllFiles(): Promise<File[]> {
    return this.repository.findAll();
  }

  async getFileById(id: string): Promise<File> {
    const file = await this.repository.findById(id);
    if (!file) {
      throw new NotFoundException(`File with ID ${id} not found`);
    }
    return file;
  }

  async updateFile(id: string, file: Express.Multer.File): Promise<File> {
    const existingFile = await this.getFileById(id);
    await this.s3UploadService.deleteFile(existingFile.url);
    
    const newUrl = await this.s3UploadService.uploadFile(file);
    return this.repository.update(id, {
      url: newUrl,
      originalName: file.originalname,
    })
  }

  async deleteFileFromS3AndDb(id: string): Promise<void> {
    const file = await this.getFileById(id);
    await this.s3UploadService.deleteFile(file.url);
    await this.repository.delete(id);
  }

  async deleteFileFromS3(url: string): Promise<void> {
    await this.s3UploadService.deleteFile(url);
  }
}