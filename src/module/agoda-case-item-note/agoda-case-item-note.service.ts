import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AgodaCaseItemNoteWithCreator,
  IAgodaCaseItemNoteRepository,
  IAgodaCaseItemNoteService,
} from './agoda-case-item-note.interface';

@Injectable()
export class AgodaCaseItemNoteService implements IAgodaCaseItemNoteService {
  private readonly logger = new Logger(AgodaCaseItemNoteService.name);

  constructor(
    @Inject('IAgodaCaseItemNoteRepository')
    private readonly repository: IAgodaCaseItemNoteRepository,
  ) {}

  private async assertCaseItemExists(agodaCaseItemId: string): Promise<void> {
    const exists = await this.repository.caseItemExists(agodaCaseItemId);
    if (!exists) {
      throw new NotFoundException(
        `Agoda case item with ID ${agodaCaseItemId} not found`,
      );
    }
  }

  /** 404s if the note doesn't exist OR belongs to a different case item — never leaks a note across items. */
  private async findOwnedNote(
    agodaCaseItemId: string,
    noteId: string,
  ): Promise<AgodaCaseItemNoteWithCreator> {
    const note = await this.repository.findById(noteId);
    if (!note || note.agoda_case_item_id !== agodaCaseItemId) {
      throw new NotFoundException(
        `Note with ID ${noteId} not found for agoda case item ${agodaCaseItemId}`,
      );
    }
    return note;
  }

  private assertIsAuthor(
    note: AgodaCaseItemNoteWithCreator,
    userId: string,
    action: 'update' | 'delete',
  ): void {
    if (note.createdBy !== userId) {
      throw new ForbiddenException(
        `Only the user who created this note can ${action} it`,
      );
    }
  }

  async create(
    agodaCaseItemId: string,
    userId: string,
    note: string,
  ): Promise<AgodaCaseItemNoteWithCreator> {
    try {
      await this.assertCaseItemExists(agodaCaseItemId);
      const created = await this.repository.create(
        agodaCaseItemId,
        userId,
        note,
      );
      this.logger.log(
        `Note ${created.id} added to AgodaCaseItem ${agodaCaseItemId} by user ${userId}`,
      );
      return created;
    } catch (error) {
      this.logger.error(
        `Error creating note on agoda case item ${agodaCaseItemId}:`,
        error,
      );
      throw error;
    }
  }

  async findAllByCaseItem(
    agodaCaseItemId: string,
  ): Promise<AgodaCaseItemNoteWithCreator[]> {
    try {
      await this.assertCaseItemExists(agodaCaseItemId);
      return await this.repository.findAllByCaseItem(agodaCaseItemId);
    } catch (error) {
      this.logger.error(
        `Error listing notes for agoda case item ${agodaCaseItemId}:`,
        error,
      );
      throw error;
    }
  }

  async findOne(
    agodaCaseItemId: string,
    noteId: string,
  ): Promise<AgodaCaseItemNoteWithCreator> {
    try {
      await this.assertCaseItemExists(agodaCaseItemId);
      return await this.findOwnedNote(agodaCaseItemId, noteId);
    } catch (error) {
      this.logger.error(`Error finding note ${noteId}:`, error);
      throw error;
    }
  }

  async update(
    agodaCaseItemId: string,
    noteId: string,
    userId: string,
    note: string,
  ): Promise<AgodaCaseItemNoteWithCreator> {
    try {
      await this.assertCaseItemExists(agodaCaseItemId);
      const existing = await this.findOwnedNote(agodaCaseItemId, noteId);
      this.assertIsAuthor(existing, userId, 'update');

      const updated = await this.repository.update(noteId, note);
      this.logger.log(`Note ${noteId} updated by user ${userId}`);
      return updated;
    } catch (error) {
      this.logger.error(`Error updating note ${noteId}:`, error);
      throw error;
    }
  }

  async delete(
    agodaCaseItemId: string,
    noteId: string,
    userId: string,
  ): Promise<{ deletedId: string }> {
    try {
      await this.assertCaseItemExists(agodaCaseItemId);
      const existing = await this.findOwnedNote(agodaCaseItemId, noteId);
      this.assertIsAuthor(existing, userId, 'delete');

      await this.repository.delete(noteId);
      this.logger.log(`Note ${noteId} deleted by user ${userId}`);
      return { deletedId: noteId };
    } catch (error) {
      this.logger.error(`Error deleting note ${noteId}:`, error);
      throw error;
    }
  }
}
