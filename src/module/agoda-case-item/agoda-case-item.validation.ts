import { OTAProvider, PostingType } from '@prisma/client';
import { z } from 'zod';

// MongoDB ObjectId validation
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, {
  message: 'Invalid ObjectId format. Must be a 24-character hex string.',
});

// Dates on this model are stored as plain MM/DD/YYYY strings, not DateTime,
// because they come straight off the Agoda case page.
const dateStringSchema = z
  .string()
  .regex(/^\d{2}\/\d{2}\/\d{4}$/, 'Date must be in MM/DD/YYYY format');

export const createAgodaCaseItemSchema = z.object({
  property_id: objectIdSchema.optional().nullable(),
  batch_id: objectIdSchema.optional().nullable(),
  portfolio_id: objectIdSchema.optional().nullable(),
  retrieval_id: objectIdSchema.optional().nullable(),
  reservation_id: z.string().optional().nullable(),
  guest_name: z.string().optional().nullable(),
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
  ota_provider: z.nativeEnum(OTAProvider).optional().nullable(),
  posting_type: z.nativeEnum(PostingType).optional().nullable(),
  is_archived: z.boolean().optional().default(false),
  is_declined: z.boolean().optional().default(false),
  createdBy: objectIdSchema.optional().nullable(),
});

export const updateAgodaCaseItemSchema = createAgodaCaseItemSchema.partial();

export const exportSelectedAgodaCaseItemsSchema = z.object({
  ids: z.array(objectIdSchema).min(1, {
    message: 'ids must be a non-empty array of AgodaCaseItem ObjectIds',
  }),
});

export type CreateAgodaCaseItemType = z.infer<typeof createAgodaCaseItemSchema>;
export type UpdateAgodaCaseItemType = z.infer<typeof updateAgodaCaseItemSchema>;
export type ExportSelectedAgodaCaseItemsType = z.infer<
  typeof exportSelectedAgodaCaseItemsSchema
>;
