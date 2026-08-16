import { z } from 'zod';

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

export const otaPostPreChargingListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export const bulkDeleteOtaPostPreChargingSchema = z.object({
  ids: z.array(objectIdSchema).min(1, 'At least one ID is required'),
});

export type OtaPostPreChargingListQueryType = z.infer<
  typeof otaPostPreChargingListQuerySchema
>;

export type BulkDeleteOtaPostPreChargingType = z.infer<
  typeof bulkDeleteOtaPostPreChargingSchema
>;
