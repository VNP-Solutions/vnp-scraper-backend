import { AgodaCaseItemNote, User } from '@prisma/client';

/** A note with just enough of its author resolved to display "who wrote this". */
export type AgodaCaseItemNoteWithCreator = AgodaCaseItemNote & {
  creator: Pick<User, 'id' | 'name' | 'email'> | null;
};

export interface IAgodaCaseItemNoteRepository {
  /** True if an AgodaCaseItem with this id exists — used to 404 before touching notes. */
  caseItemExists(agodaCaseItemId: string): Promise<boolean>;

  create(
    agodaCaseItemId: string,
    createdBy: string,
    note: string,
  ): Promise<AgodaCaseItemNoteWithCreator>;

  /** Every note on the item, newest first. */
  findAllByCaseItem(
    agodaCaseItemId: string,
  ): Promise<AgodaCaseItemNoteWithCreator[]>;

  findById(id: string): Promise<AgodaCaseItemNoteWithCreator | null>;

  /** Only the note text is editable — note_time, createdBy and the parent item never change. */
  update(id: string, note: string): Promise<AgodaCaseItemNoteWithCreator>;

  delete(id: string): Promise<AgodaCaseItemNote>;
}

export interface IAgodaCaseItemNoteService {
  create(
    agodaCaseItemId: string,
    userId: string,
    note: string,
  ): Promise<AgodaCaseItemNoteWithCreator>;

  findAllByCaseItem(
    agodaCaseItemId: string,
  ): Promise<AgodaCaseItemNoteWithCreator[]>;

  findOne(
    agodaCaseItemId: string,
    noteId: string,
  ): Promise<AgodaCaseItemNoteWithCreator>;

  /** Throws ForbiddenException if `userId` didn't author this note. */
  update(
    agodaCaseItemId: string,
    noteId: string,
    userId: string,
    note: string,
  ): Promise<AgodaCaseItemNoteWithCreator>;

  /** Throws ForbiddenException if `userId` didn't author this note. */
  delete(
    agodaCaseItemId: string,
    noteId: string,
    userId: string,
  ): Promise<{ deletedId: string }>;
}
