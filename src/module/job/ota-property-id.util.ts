import { OTAProvider } from '@prisma/client';

type OtaPropertyRecord =
  | {
      expedia_id?: number | null;
      booking_id?: number | null;
      agoda_id?: number | null;
    }
  | null
  | undefined;

/** Reads the OTA-specific property ID from a Property row. */
export function readOtaIdFromPropertyRecord(
  ota: OTAProvider | null | undefined,
  property: OtaPropertyRecord,
): number | null {
  if (!ota || !property) return null;
  switch (ota) {
    case OTAProvider.Expedia:
      return property.expedia_id ?? null;
    case OTAProvider.Booking:
      return property.booking_id ?? null;
    case OTAProvider.Agoda:
      return property.agoda_id ?? null;
    default:
      return null;
  }
}

/**
 * Resolves the OTA property ID for a job export row.
 * Tries the linked Property first, then RecurringJob.hotel_id.
 */
export function resolveOtaPropertyIdForJob(job: {
  ota_provider?: OTAProvider | null;
  property?: OtaPropertyRecord;
  recurringJob?: { hotel_id?: number | null } | null;
}): string | number {
  const fromProperty = readOtaIdFromPropertyRecord(
    job?.ota_provider ?? undefined,
    job?.property,
  );
  if (fromProperty !== null && fromProperty !== undefined) {
    return fromProperty;
  }

  const hotelId = job?.recurringJob?.hotel_id;
  if (hotelId !== null && hotelId !== undefined) {
    return hotelId;
  }

  return '';
}

export function jobNeedsOtaPropertyIdEnrichment(job: any): boolean {
  return resolveOtaPropertyIdForJob(job) === '';
}
