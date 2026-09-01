import { z } from 'zod';

// MongoDB ObjectId validation
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, {
  message: 'Invalid ObjectId format. Must be a 24-character hex string.',
});

// Dates on this model are stored as plain YYYY-MM-DD strings, not DateTime,
// because they come straight off the Agoda case page.
const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

export const createAgodaCaseItemSchema = z.object({
  property_id: objectIdSchema.optional().nullable(),
  batch_id: objectIdSchema.optional().nullable(),
  portfolio_id: objectIdSchema.optional().nullable(),
  reservation_id: z.string().optional().nullable(),
  client_name: z.string().optional().nullable(),
  check_in: dateStringSchema.optional().nullable(),
  check_out: dateStringSchema.optional().nullable(),
  amount: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  amount_to_charge: z.string().optional().nullable(),
  charge_status: z.string().optional().nullable(),
  vcc_card_number: z.string().optional().nullable(),
  card_expire: z.string().optional().nullable(),
  card_cvv: z.string().optional().nullable(),
  is_missing: z.boolean().optional().default(false),
  retrival_status: z.string().optional().nullable(),
  createdBy: z.string().optional().nullable(),
});

export const updateAgodaCaseItemSchema = createAgodaCaseItemSchema.partial();

export type CreateAgodaCaseItemType = z.infer<typeof createAgodaCaseItemSchema>;
export type UpdateAgodaCaseItemType = z.infer<typeof updateAgodaCaseItemSchema>;
