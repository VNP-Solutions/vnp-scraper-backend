import { JobStatus, OTAProvider } from '@prisma/client';
import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, {
  message: 'Invalid ObjectId format. Must be a 24-character hex string.',
});

export const SearchModeEnum = z.enum(['property', 'portfolio']);
export const JobTypeEnum = z.enum(['VCC', 'DB', 'Retrieval']);
export const FrequencyTypeEnum = z.enum(['Manual', 'Recurring']);
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
    // "Retrieve reports for" mode
    search_mode: SearchModeEnum,

    // Free-text search box.
    // Property mode: matches Property.name (contains, case-insensitive) OR
    //                exact match on Property.expedia_id / booking_id / agoda_id
    //                when the value is purely numeric.
    // Portfolio mode: same matching, but limited to properties under the
    //                 selected portfolio.
    search_term: z.string().trim().optional().nullable(),

    // Required when search_mode === 'portfolio'.
    portfolio_id: objectIdSchema.optional().nullable(),

    // Optional explicit property selection. Used to restrict the search to
    // the given properties (e.g. user picked a subset under a portfolio).
    property_ids: z.array(objectIdSchema).optional().default([]),

    // Advanced Filters
    ota_providers: z.array(z.nativeEnum(OTAProvider)).optional().default([]),
    job_types: z.array(JobTypeEnum).optional().default([]),

    // "Run within" -> filters by record updatedAt (Jobs + Retrievals).
    run_within: dateRangeSchema,

    // "All Status" -> matches Job.job_status / Retrieval.job_status.
    job_statuses: z.array(z.nativeEnum(JobStatus)).optional().default([]),

    // "Frequency Type" -> matches execution_type.
    frequency_types: z.array(FrequencyTypeEnum).optional().default([]),

    // "Card Period" -> matches Job.tags entry { field: 'over_160' }.
    // Currently applies to Jobs only. Will also apply to Retrievals once
    // the equivalent tag is added there.
    card_periods: z.array(CardPeriodEnum).optional().default([]),

    // "Job dates within" -> filters by Job/Retrieval.start_date and end_date
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
  .strict()
  .refine(
    (val) =>
      !(val.search_mode === 'portfolio' && !val.portfolio_id),
    {
      message: 'portfolio_id is required when search_mode is "portfolio"',
      path: ['portfolio_id'],
    },
  );

export type SearchReportsType = z.infer<typeof searchReportsSchema>;
