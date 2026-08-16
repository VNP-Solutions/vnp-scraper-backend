import { z } from 'zod';

const phoneWithDigitsSchema = z
  .string()
  .min(1, 'phone_number is required')
  .trim()
  .refine(
    (v) => (v.match(/\d/g) || []).length >= 1,
    'phone_number must contain at least one digit',
  );

export const createPhoneNumberSlotSchema = z.object({
  phone_number: phoneWithDigitsSchema,
  slot: z.coerce.number().int(),
});

export const updatePhoneNumberSlotSchema = z.object({
  phone_number: phoneWithDigitsSchema,
  slot: z.coerce.number().int(),
});
