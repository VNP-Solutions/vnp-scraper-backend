import { z } from 'zod';

export const createPortfolioSchema = z.object({
  name: z.string().min(1),
});

export const updatePortfolioSchema = z.object({
  name: z.string().min(1),
});
