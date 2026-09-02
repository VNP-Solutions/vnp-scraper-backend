/**
 * Shared by every endpoint that needs a job's Agoda ID (the Partner Support
 * capture and send-to-retrieval flows), so the "0"/null-means-unset rule
 * lives in exactly one place.
 */

import { Job } from '@prisma/client';
import { IPropertyRepository } from '../property/property.interface';

/**
 * Resolves the property's Agoda ID for a job. `agoda_id` on `properties` is
 * a nullable number; `0`, `null` and `undefined` all mean "unset".
 */
export async function resolveAgodaIdForJob(
  job: Pick<Job, 'property_id'>,
  propertyRepository: IPropertyRepository,
): Promise<string | null> {
  if (!job.property_id) return null;

  const property = await propertyRepository.findById(job.property_id);
  if (!property?.agoda_id) return null;

  return String(property.agoda_id);
}
