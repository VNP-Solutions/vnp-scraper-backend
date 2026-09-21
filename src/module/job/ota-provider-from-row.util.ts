import { OTAProvider } from '@prisma/client';

function cellFilled(value: unknown): boolean {
  return value != null && String(value).trim() !== '';
}

/**
 * Trip.com property id is optional. A row with Trip login fields and no
 * Expedia/Booking/Agoda id is still a Trip job.
 */
export function otaProviderFromImportRow(
  row: Record<string, unknown>,
): OTAProvider {
  if (cellFilled(row['Expedia ID'])) return OTAProvider.Expedia;
  if (cellFilled(row['Booking ID'])) return OTAProvider.Booking;
  if (cellFilled(row['Agoda ID'])) return OTAProvider.Agoda;
  if (
    cellFilled(row['Trip ID']) ||
    cellFilled(row['Trip Username']) ||
    cellFilled(row['Trip Password']) ||
    cellFilled(row['Trip VCC Password'])
  ) {
    return OTAProvider.Trip;
  }
  return OTAProvider.Expedia;
}
