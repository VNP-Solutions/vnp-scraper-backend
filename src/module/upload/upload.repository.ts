import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { File } from '@prisma/client';
import { CreateFileDto, UpdateFileDto } from './upload.dto';
import { IUploadRepository } from './upload.interface';

@Injectable()
export class UploadRepository implements IUploadRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  get databaseService(): DatabaseService {
    return this.db;
  }

  async create(data: any): Promise<File> {
    try {
      const result = await this.db.file.create({ data });
      return result;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findAll(): Promise<File[]> {
    try {
      const results = await this.db.file.findMany();
      return results;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findById(id: string): Promise<File> {
    try {
      const result = await this.db.file.findUnique({
        where: { id }
      });
      return result;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async update(id: string, data: UpdateFileDto): Promise<File> {
    try {
      const result = await this.db.file.update({
        where: { id },
        data
      });
      return result;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async delete(id: string): Promise<File> {
    try {
      const result = await this.db.file.delete({
        where: { id }
      });
      return result;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }
}