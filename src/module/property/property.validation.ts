import { OTAProvider } from '@prisma/client';
import { z } from 'zod';

// MongoDB ObjectId validation
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, {
  message: 'Invalid ObjectId format. Must be a 24-character hex string.',
});

export const createPropertySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  portfolio_id: objectIdSchema.optional().nullable(),
  sub_portfolio_id: objectIdSchema.optional().nullable(),
  expedia_id: z.number().optional().nullable(),
  expedia_status: z.string().optional().nullable(),
  booking_id: z.number().optional().nullable(),
  booking_status: z.string().optional().nullable(),
  agoda_id: z.number().optional().nullable(),
  agoda_status: z.string().optional().nullable(),
  phone_number: z.string().optional().nullable(),
  slot: z.coerce.number().int().optional().nullable(),
  phone_number_slot_id: objectIdSchema.optional().nullable(),
});

export const updatePropertySchema = createPropertySchema;

/** Updates `property_credentials` for one property; OTA fields chosen from `ota_provider`. */
export const updateOtaCredentialsSchema = z
  .object({
    property_id: objectIdSchema,
    ota_provider: z.nativeEnum(OTAProvider),
    username: z.string().optional(),
    password: z.string().optional(),
  })
  .refine(
    (row) =>
      (row.username != null && String(row.username).trim() !== '') ||
      (row.password != null && String(row.password).trim() !== ''),
    {
      message:
        'Provide a non-empty username and/or password for the chosen OTA',
    },
  );

export type UpdateOtaCredentialsBody = z.infer<typeof updateOtaCredentialsSchema>;

export const revealOtaCredentialsSchema = z.object({
  property_id: objectIdSchema,
  ota_provider: z.nativeEnum(OTAProvider),
});

export type RevealOtaCredentialsBody = z.infer<typeof revealOtaCredentialsSchema>;
