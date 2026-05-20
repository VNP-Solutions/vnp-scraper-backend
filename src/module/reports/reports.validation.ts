import { JobStatus, OTAProvider } from '@prisma/client';
import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, {
  message: 'Invalid ObjectId format. Must be a 24-character hex string.',
});

export const SearchModeEnum = z.enum(['property', 'portfolio']);
export const JobTypeEnum = z.enum(['VCC', 'DB', 'Retrieval']);
// Frequency Type — UI labels for the `frequency_types` filter.
// These map onto `Job.execution_type` values stored in the DB:
//   'Manual'    → matches DB values 'Manual' / 'manual'
//   'immediate' → matches DB values 'Immediate' / 'immediate'
//                 (the Excel import path defaults to 'Immediate' when no
//                  execution-type cell is present — see job.service.ts).
export const FrequencyTypeEnum = z.enum(['Manual', 'immediate']);
export const CardPeriodEnum = z.enum(['Over160', 'Under160']);
export const SortOrderEnum = z.enum(['asc', 'desc']);
export const ReportsSortByEnum = z.enum([
  'updatedAt',
  'createdAt',
  'start_date',
  'end_date',
  'property_name',
  'job_status',
]);

const dateRangeSchema = z
  .object({
    from: z.string().min(1).optional().nullable(),
    to: z.string().min(1).optional().nullable(),
  })
  .strict()
  .optional()
  .nullable();

const jobDatesSchema = z
  .object({
    start_date: z.string().min(1).optional().nullable(),
    end_date: z.string().min(1).optional().nullable(),
  })
  .strict()
  .optional()
  .nullable();

export const searchReportsSchema = z
  .object({
    // OPTIONAL hint kept for backwards-compatibility with the original UI
    // ("Retrieve reports for: Property / Portfolio" radio). The service
    // no longer uses this for routing — it routes purely on the presence
    // of `portfolio_id`, `property_ids`, and `search_term`. Sending it,
    // omitting it, or sending either value is all valid; the result is
    // identical for the same set of other filters.
    search_mode: SearchModeEnum.optional().nullable(),

    // Free-text search box. Matches Property.name (contains, case-
    // insensitive) OR exact match on Property.expedia_id / booking_id /
    // agoda_id when the value is purely numeric. Independent of every
    // other field — combine freely with portfolio_id / property_ids.
    search_term: z.string().trim().optional().nullable(),

    // Optional portfolio scope. When set, the search is restricted to
    // properties under this portfolio (∩ user access for non-admins).
    // Independent of `property_ids` and `search_term` — combine freely.
    portfolio_id: objectIdSchema.optional().nullable(),

    // Optional explicit property selection. Independent of everything
    // else; restricts the search to the given property IDs.
    property_ids: z.array(objectIdSchema).optional().default([]),

    // Advanced Filters
    ota_providers: z.array(z.nativeEnum(OTAProvider)).optional().default([]),
    // `Retrieval` stays in the enum for backwards-compat so existing
    // frontends don't 400, but the reports module no longer queries the
    // Retrieval collection — VCC/DB are the only values that affect
    // results.
    job_types: z.array(JobTypeEnum).optional().default([]),

    // "Run within" -> filters by Job.updatedAt.
    run_within: dateRangeSchema,

    // "All Status" -> matches Job.job_status.
    job_statuses: z.array(z.nativeEnum(JobStatus)).optional().default([]),

    // "Frequency Type" -> matches execution_type.
    frequency_types: z.array(FrequencyTypeEnum).optional().default([]),

    // "Card Period" -> matches Job.tags entry { field: 'over_160' }.
    card_periods: z.array(CardPeriodEnum).optional().default([]),

    // "Job dates within" -> filters by Job.start_date and end_date
    // (stored as MM/DD/YYYY strings in the DB).
    job_dates: jobDatesSchema,

    // "Batch" -> empty / missing array means "All"; otherwise filter to
    // jobs/retrievals whose batch_id is in the given list.
    batch_ids: z.array(objectIdSchema).optional().default([]),

    // "Include Archived Jobs" toggle.
    include_archived: z.boolean().optional().default(false),

    // Pagination + sorting
    page: z.number().int().min(1).optional().default(1),
    limit: z.number().int().min(1).max(200).optional().default(10),
    sortBy: ReportsSortByEnum.optional().default('updatedAt'),
    sortOrder: SortOrderEnum.optional().default('desc'),
  })
  .strict();

export type SearchReportsType = z.infer<typeof searchReportsSchema>;

/**
 * Body for POST /reports/export-master. Requires at least one `job_id`.
 * The endpoint returns a ZIP containing one XLSX per job.
 *
 * (Retrievals are intentionally not supported by the Reports module's
 * export — if/when bulk-retrieval export is added, it will live under
 * the retrieval module.)
 */
export const exportReportsMasterSchema = z
  .object({
    job_ids: z
      .array(objectIdSchema)
      .min(1, 'At least one job ID is required'),
  })
  .strict();

export type ExportReportsMasterType = z.infer<typeof exportReportsMasterSchema>;
