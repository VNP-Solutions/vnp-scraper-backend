import { z } from 'zod';

export const createSubPortfolioSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters'),
  description: z
    .string()
    .optional()
    .transform((str) => str || ''),
  portfolio_id: z
    .string()
    .min(24, 'Invalid portfolio ID')
    .max(24, 'Invalid portfolio ID')
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB ObjectId format'),
});

export const updateSubPortfolioSchema = createSubPortfolioSchema.partial();