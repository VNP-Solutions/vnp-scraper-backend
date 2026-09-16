import { z } from 'zod';

// MongoDB ObjectId validation (mirrors job.validation.ts's private
// `objectIdSchema` — kept local here since nothing exports it).
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, {
  message: 'Invalid ObjectId format. Must be a 24-character hex string.',
});

/**
 * Body schema for `POST /scraper/api/jobs/items/export-with-verdicts` — the
 * multi-job counterpart to `GET /scraper/api/jobs/:jobId/items/export-with-verdicts`.
 * Mirrors `exportMasterJobsSchema` in job.validation.ts (same shape,
 * same "at least one ID" rule) since this endpoint follows the exact
 * same single-vs-bulk pattern as `/jobs/export-master`.
 */
export const exportJobItemsWithDetailsSchema = z.object({
  job_ids: z.array(objectIdSchema).min(1, 'At least one job ID is required'),
});

export type ExportJobItemsWithDetailsType = z.infer<
  typeof exportJobItemsWithDetailsSchema
>;
