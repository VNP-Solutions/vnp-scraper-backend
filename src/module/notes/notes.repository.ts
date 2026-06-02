import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { CreateNoteDto, UpdateNoteDto } from './notes.dto';
import { INotesRepository } from './notes.interface';

const noteInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      image: true,
      phone_number: true,
    },
  },
  onboarding: true,
} satisfies Prisma.NoteInclude;

@Injectable()
export class NotesRepository implements INotesRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  async create(data: CreateNoteDto): Promise<any> {
    try {
      return await this.db.note.create({
        data: {
          comment: data.comment,
          user: { connect: { id: data.user_id } },
          onboarding: { connect: { id: data.onboarding_id } },
        },
        include: noteInclude,
      });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findById(id: string): Promise<any> {
    try {
      return await this.db.note.findUnique({ where: { id }, include: noteInclude });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findAllByQuery(
    query: Record<string, any>,
  ): Promise<{ data: any[]; metadata: any }> {
    const { page, limit, sortBy, sortOrder, onboarding_id, user_id } = query || {};

    const skip = page
      ? (parseInt(String(page), 10) - 1) * parseInt(String(limit || '10'), 10)
      : 0;
    const take = limit ? parseInt(String(limit), 10) : 10;

    let orderBy: { [key: string]: 'asc' | 'desc' } = { createdAt: 'desc' };
    if (sortBy) {
      orderBy = {
        [sortBy]: sortOrder?.toString().toLowerCase() === 'desc' ? 'desc' : 'asc',
      };
    }

    const where: any = {};

    if (onboarding_id) {
      where.onboarding_id = onboarding_id;
    }

    if (user_id) {
      where.user_id = user_id;
    }

    try {
      const [data, totalDocuments] = await Promise.all([
        this.db.note.findMany({ where, skip, take, orderBy, include: noteInclude }),
        this.db.note.count({ where }),
      ]);

      const metadata = {
        totalDocuments,
        currentPage: parseInt(String(page || '1'), 10),
        totalPage: Math.ceil(totalDocuments / take) || 0,
        limit: take,
      };

      return { data, metadata };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async update(id: string, data: UpdateNoteDto): Promise<any> {
    try {
      return await this.db.note.update({
        where: { id },
        data: { comment: data.comment },
        include: noteInclude,
      });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async delete(id: string): Promise<any> {
    try {
      return await this.db.note.delete({ where: { id } });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
}
