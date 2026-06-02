import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateNoteDto, UpdateNoteDto } from './notes.dto';
import { INotesRepository, INotesService } from './notes.interface';

@Injectable()
export class NotesService implements INotesService {
  constructor(
    @Inject('INotesRepository')
    private readonly repository: INotesRepository,
    private readonly logger: Logger,
  ) {}

  async create(data: CreateNoteDto): Promise<any> {
    try {
      return await this.repository.create(data);
    } catch (error) {
      this.logger.error(`Error creating note: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findById(id: string): Promise<any> {
    try {
      const note = await this.repository.findById(id);
      if (!note) {
        throw new NotFoundException(`Note with id "${id}" not found`);
      }
      return note;
    } catch (error) {
      this.logger.error(`Error finding note: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findAll(
    query: Record<string, any>,
  ): Promise<{ data: any[]; metadata: any }> {
    try {
      return await this.repository.findAllByQuery(query);
    } catch (error) {
      this.logger.error(`Error fetching notes: ${error.message}`, error.stack);
      throw error;
    }
  }

  async update(id: string, data: UpdateNoteDto): Promise<any> {
    try {
      await this.findById(id);
      return await this.repository.update(id, data);
    } catch (error) {
      this.logger.error(`Error updating note: ${error.message}`, error.stack);
      throw error;
    }
  }

  async delete(id: string): Promise<any> {
    try {
      await this.findById(id);
      return await this.repository.delete(id);
    } catch (error) {
      this.logger.error(`Error deleting note: ${error.message}`, error.stack);
      throw error;
    }
  }
}
