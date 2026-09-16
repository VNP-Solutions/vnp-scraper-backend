import { z } from 'zod';

export const createAgodaCaseItemNoteSchema = z.object({
  note: z.string().trim().min(1, { message: 'note is required' }),
});

export const updateAgodaCaseItemNoteSchema = z.object({
  note: z.string().trim().min(1, { message: 'note is required' }),
});

export type CreateAgodaCaseItemNoteType = z.infer<
  typeof createAgodaCaseItemNoteSchema
>;
export type UpdateAgodaCaseItemNoteType = z.infer<
  typeof updateAgodaCaseItemNoteSchema
>;
