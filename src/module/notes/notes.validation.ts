import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, {
  message: 'Invalid ObjectId format. Must be a 24-character hex string.',
});

export const createNoteSchema = z.object({
  comment: z.string().min(1, 'Comment is required'),
  onboarding_id: objectIdSchema,
});

export const updateNoteSchema = z.object({
  comment: z.string().min(1, 'Comment is required'),
});

export type CreateNoteType = z.infer<typeof createNoteSchema>;
export type UpdateNoteType = z.infer<typeof updateNoteSchema>;
