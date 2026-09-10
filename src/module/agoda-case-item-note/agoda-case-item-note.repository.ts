import { Injectable, Logger } from '@nestjs/common';
import { AgodaCaseItemNote } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import {
  AgodaCaseItemNoteWithCreator,
  IAgodaCaseItemNoteRepository,
} from './agoda-case-item-note.interface';

@Injectable()
export class AgodaCaseItemNoteRepository
  implements IAgodaCaseItemNoteRepository
{
  private readonly logger = new Logger(AgodaCaseItemNoteRepository.name);

  constructor(private readonly db: DatabaseService) {}

  /** Shared across every read so the author fields returned never drift. */
  private readonly creatorSelect = {
    select: { id: true, name: true, email: true },
  };

  async caseItemExists(agodaCaseItemId: string): Promise<boolean> {
    try {
      const item = await this.db.agodaCaseItem.findUnique({
        where: { id: agodaCaseItemId },
        select: { id: true },
      });
      return !!item;
    } catch (error) {
      this.logger.error(
        `Error checking agoda case item ${agodaCaseItemId}:`,
        error,
      );
      throw error;
    }
  }

  async create(
    agodaCaseItemId: string,
    createdBy: string,
    note: string,
  ): Promise<AgodaCaseItemNoteWithCreator> {
    try {
      return (await this.db.agodaCaseItemNote.create({
        data: {
          note,
          agodaCaseItem: { connect: { id: agodaCaseItemId } },
          creator: { connect: { id: createdBy } },
        },
        include: { creator: this.creatorSelect },
      })) as AgodaCaseItemNoteWithCreator;
    } catch (error) {
      this.logger.error('Error creating agoda case item note:', error);
      throw error;
    }
  }

  async findAllByCaseItem(
    agodaCaseItemId: string,
  ): Promise<AgodaCaseItemNoteWithCreator[]> {
    try {
      return (await this.db.agodaCaseItemNote.findMany({
        where: { agoda_case_item_id: agodaCaseItemId },
        orderBy: { note_time: 'desc' },
        include: { creator: this.creatorSelect },
      })) as AgodaCaseItemNoteWithCreator[];
    } catch (error) {
      this.logger.error(
        `Error finding notes for agoda case item ${agodaCaseItemId}:`,
        error,
      );
      throw error;
    }
  }

  async findById(id: string): Promise<AgodaCaseItemNoteWithCreator | null> {
    try {
      return (await this.db.agodaCaseItemNote.findUnique({
        where: { id },
        include: { creator: this.creatorSelect },
      })) as AgodaCaseItemNoteWithCreator | null;
    } catch (error) {
      this.logger.error(`Error finding agoda case item note ${id}:`, error);
      throw error;
    }
  }

  async update(
    id: string,
    note: string,
  ): Promise<AgodaCaseItemNoteWithCreator> {
    try {
      return (await this.db.agodaCaseItemNote.update({
        where: { id },
        data: { note },
        include: { creator: this.creatorSelect },
      })) as AgodaCaseItemNoteWithCreator;
    } catch (error) {
      this.logger.error(`Error updating agoda case item note ${id}:`, error);
      throw error;
    }
  }

  async delete(id: string): Promise<AgodaCaseItemNote> {
    try {
      return await this.db.agodaCaseItemNote.delete({ where: { id } });
    } catch (error) {
      this.logger.error(`Error deleting agoda case item note ${id}:`, error);
      throw error;
    }
  }
}
