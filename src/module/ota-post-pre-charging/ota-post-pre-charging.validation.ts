import { z } from 'zod';

export const otaPostPreChargingListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export type OtaPostPreChargingListQueryType = z.infer<
  typeof otaPostPreChargingListQuerySchema
>;
