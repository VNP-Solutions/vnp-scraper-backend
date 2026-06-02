import {
  Body,
  Controller,
  Inject,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ExportReportsMasterRequestDto,
  ReportsStatisticsResponseDto,
  SearchReportIdsResponseDto,
  SearchReportsRequestDto,
  SearchReportsResponseDto,
} from './reports.dto';
import { IReportsService } from './reports.interface';
import {
  ReportExportType,
  enqueueReportExport,
  getReportsExportQueueUrl,
} from './reports-sqs.util';
import {
  exportReportsMasterSchema,
  type ExportReportsMasterType,
  searchReportsSchema,
  type SearchReportsType,
} from './reports.validation';

/**
 * Job-count threshold above which a `/reports/export-*` request is
 * pushed to SQS and the response becomes "we'll email you the link"
 * instead of streaming the file synchronously. Set to 10 per the
 * product spec — anything ≤ 10 jobs stays on the synchronous path so
 * small exports still feel instant.
 */
const ASYNC_EXPORT_THRESHOLD = 10;

@ApiTags('Reports')
@ApiBearerAuth('JWT-auth')
@Controller('/reports')
export class ReportsController {
  constructor(
    @Inject('IReportsService')
    private readonly reportsService: IReportsService,
    private readonly logger: Logger,
  ) {}

  /**
   * Shared "should this export go async?" gate. Returns `true` when the
   * caller's response has been fully written (caller must return
   * without doing anything else); `false` when the caller should fall
   * through to its existing synchronous path.
   *
   * The async path is taken when ALL of the following hold:
   *   1. The request has more than `ASYNC_EXPORT_THRESHOLD` job_ids.
   *   2. `REPORTS_EXPORT_QUEUE_URL` is configured.
   *   3. The JWT carries an email we can deliver the link to.
   *
   * If (1) but not (2)/(3), we log a warning and fall back to sync so
   * dev environments (no queue) still work — the user might just hit
   * nginx's `proxy_read_timeout` on huge exports, but the request
   * never silently disappears.
   */
  private async tryEnqueueAsyncExport(
    request: any,
    body: ExportReportsMasterType,
    exportType: ReportExportType,
    response: Response,
  ): Promise<boolean> {
    const jobIdsCount = body.job_ids?.length ?? 0;
    if (jobIdsCount <= ASYNC_EXPORT_THRESHOLD) return false;

    const queueUrl = getReportsExportQueueUrl();
    if (!queueUrl) {
      this.logger.warn(
        `Async export requested (${jobIdsCount} jobs, type=${exportType}) ` +
          `but REPORTS_EXPORT_QUEUE_URL is not configured — falling back to ` +
          `the synchronous path.`,
      );
      return false;
    }

    const user = request.user;
    if (!user?.email) {
      this.logger.warn(
        `Async export requested but JWT carries no email — falling back to ` +
          `the synchronous path (user=${user?.userId ?? 'unknown'}).`,
      );
      return false;
    }

    // Build the payload once so we can both measure it (Fix B) and send
    // it (line below). De-dupe + drop falsy IDs to mirror what the
    // consumer would have processed anyway, and shrink the body a bit.
    const payload = {
      exportType,
      jobIds: Array.from(new Set(body.job_ids ?? [])).filter(Boolean),
      user: {
        userId: user.userId,
        email: user.email,
        name: user.name ?? null,
      },
      requestedAt: new Date().toISOString(),
    };

    // Defense-in-depth against the SQS 256 KB per-message hard limit.
    // Zod's `.max(8000)` on job_ids (see reports.validation.ts) already
    // keeps us well under this in normal operation. This check is here
    // so that if someone ever raises the Zod cap, adds new fields to
    // the payload, or bypasses validation, we still fail fast with a
    // clean 400 instead of letting SQS reject the SendMessage with an
    // opaque AWS SDK error.
    const SQS_MAX_BODY_BYTES = 240 * 1024; // 240 KB — 16 KB headroom under 256 KB
    const payloadBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    if (payloadBytes > SQS_MAX_BODY_BYTES) {
      this.logger.warn(
        `Refusing to enqueue ${exportType} export — payload ` +
          `${payloadBytes} B exceeds ${SQS_MAX_BODY_BYTES} B SQS body cap ` +
          `(user=${user.email}, jobs=${payload.jobIds.length}).`,
      );
      response.status(400).json({
        statusCode: 400,
        message:
          `Export request is too large to queue. Please narrow your ` +
          `filters (current payload: ${Math.round(payloadBytes / 1024)} KB, ` +
          `max: ${Math.round(SQS_MAX_BODY_BYTES / 1024)} KB).`,
        data: null,
      });
      return true;
    }

    try {
      await enqueueReportExport(payload, this.logger);
    } catch (err) {
      this.logger.error(
        `Failed to enqueue ${exportType} export: ${err?.message ?? err}`,
        err?.stack,
      );
      response.status(500).json({
        statusCode: 500,
        message:
          'Failed to queue the export for background processing. Please try again.',
        data: null,
      });
      return true;
    }

    response.status(202).json({
      statusCode: 202,
      message:
        `Your export is being prepared. We will email a download link to ` +
        `${user.email} when it's ready (usually within a few minutes).`,
      data: {
        queued: true,
        exportType,
        email: user.email,
        jobIdsCount,
      },
    });
    return true;
  }

  @Post('/global')
  @UseGuards(JwtAuthGuard)
  @ValidateBody(searchReportsSchema)
  @ApiOperation({
    summary: 'Search Parser Global Reports (Jobs only)',
    description:
      'Unified search for the Parser Global Reports screen. Returns a ' +
      'paginated list of Jobs (VCC / DB).\n\n' +
      '### All fields are optional and independent\n' +
      'You can send `{}` to get every job the caller can see, or mix any ' +
      'subset of these filters freely (none of them depend on any of the ' +
      'others):\n' +
      '- `search_term` — Property.name (case-insensitive contains) or ' +
      '  numeric exact match on Property.expedia_id / booking_id / agoda_id\n' +
      '- `portfolio_id` — scope to properties under one portfolio\n' +
      '- `property_ids` — restrict to an explicit list of properties\n' +
      '- `ota_providers` — Expedia / Booking / Agoda\n' +
      '- `job_types` — `VCC` / `DB` filter on `Job.billing_type`. ' +
      '  (`Retrieval` is still accepted by the validator for backwards ' +
      '  compatibility but is silently ignored — this endpoint no longer ' +
      '  queries the Retrieval collection.)\n' +
      '- `run_within` → `updatedAt` range\n' +
      '- `job_statuses`, `frequency_types`, `card_periods`, `batch_ids`\n' +
      '- `job_dates` → Job `start_date` / `end_date` overlap\n' +
      '- `include_archived`\n\n' +
      '`search_mode` (`property` / `portfolio`) is accepted for backwards ' +
      'compatibility with the original UI radio but is no longer used for ' +
      'routing — the backend routes purely on whether `portfolio_id` is ' +
      'set.\n\n' +
      'Non-admin users are automatically scoped to their ' +
      '`UserFeatureAccessPermission` entries.',
  })
  @ApiBody({
    type: SearchReportsRequestDto,
    examples: {
      // ───────────────────── No-mode / minimal payloads ────────────────────
      a00_empty: {
        summary:
          '00) Empty body {} — every job the user can see',
        description:
          'All filter fields are optional. With an empty body the endpoint ' +
          'returns every job the caller has permission to view (admin → ' +
          'all; non-admin → only items inside their ' +
          'UserFeatureAccessPermission scope).',
        value: {},
      },
      a00b_search_only: {
        summary:
          '00b) Just a search term — no search_mode, no portfolio',
        description:
          'Demonstrates that fields are now independent. No `search_mode` ' +
          'needed; the endpoint searches Property.name (and numeric ' +
          'matches on expedia/booking/agoda IDs) across everything the ' +
          'caller can see.',
        value: { search_term: 'Moxy' },
      },
      a00c_portfolio_only: {
        summary:
          '00c) Just a portfolio_id — no search_mode required',
        description:
          'Sending `portfolio_id` alone scopes the search to that ' +
          'portfolio. `search_mode` is no longer required (or used) for ' +
          'this behaviour.',
        value: { portfolio_id: '65f0a3c4e2b7a1d2c3e4f5a6' },
      },
      a00d_portfolio_plus_search: {
        summary:
          '00d) portfolio_id + search_term combined (independent)',
        description:
          'Both fields are honoured independently — the term is matched ' +
          'against properties under the portfolio.',
        value: {
          portfolio_id: '65f0a3c4e2b7a1d2c3e4f5a6',
          search_term: 'Moxy',
        },
      },
      // ─────────────────────────── Search basics ───────────────────────────
      a01_minimal_property: {
        summary: '01) Minimal — Property mode, no filters',
        description:
          'Smallest valid request. Returns every job the user can see, sorted by updatedAt desc.',
        value: {
          search_mode: 'property',
          page: 1,
          limit: 10,
        },
      },
      a02_property_by_name: {
        summary: '02) Property mode — search by property name',
        description:
          'Free-text term matches Property.name (case-insensitive contains).',
        value: {
          search_mode: 'property',
          search_term: 'Moxy',
          page: 1,
          limit: 10,
        },
      },
      a03_property_by_expedia_id: {
        summary: '03) Property mode — search by Expedia ID',
        description:
          'Numeric term → exact match on Property.expedia_id (also probes booking_id / agoda_id with the same number).',
        value: {
          search_mode: 'property',
          search_term: '12345678',
          page: 1,
          limit: 10,
        },
      },
      a04_property_by_booking_id: {
        summary: '04) Property mode — search by Booking ID',
        description:
          'Same numeric-search behaviour; pair with ota_providers to be explicit about the source.',
        value: {
          search_mode: 'property',
          search_term: '87654321',
          ota_providers: ['Booking'],
          page: 1,
          limit: 10,
        },
      },
      a05_property_by_agoda_id: {
        summary: '05) Property mode — search by Agoda ID',
        value: {
          search_mode: 'property',
          search_term: '55555555',
          ota_providers: ['Agoda'],
          page: 1,
          limit: 10,
        },
      },
      a06_property_explicit_ids: {
        summary: '06) Property mode — pass property_ids directly (no search box)',
        description:
          'When the user has already selected one or more properties on the UI, send their ObjectIds in property_ids.',
        value: {
          search_mode: 'property',
          property_ids: [
            '65f0a3c4e2b7a1d2c3e4f5a7',
            '65f0a3c4e2b7a1d2c3e4f5a8',
          ],
          page: 1,
          limit: 10,
        },
      },

      // ─────────────────────────── Portfolio mode ──────────────────────────
      b01_portfolio_all_properties: {
        summary: '07) Portfolio mode — all properties under a portfolio',
        description:
          'No search_term and no property_ids → every job for any property under the portfolio (direct or via sub-portfolio).',
        value: {
          search_mode: 'portfolio',
          portfolio_id: '65f0a3c4e2b7a1d2c3e4f5a6',
          page: 1,
          limit: 10,
        },
      },
      b02_portfolio_subset_of_properties: {
        summary: '08) Portfolio mode — only specific properties under a portfolio',
        description:
          'portfolio_id selects the parent, property_ids narrows to the chosen subset.',
        value: {
          search_mode: 'portfolio',
          portfolio_id: '65f0a3c4e2b7a1d2c3e4f5a6',
          property_ids: [
            '65f0a3c4e2b7a1d2c3e4f5a7',
            '65f0a3c4e2b7a1d2c3e4f5a8',
          ],
          page: 1,
          limit: 10,
        },
      },
      b03_portfolio_with_search_term: {
        summary: '09) Portfolio mode — narrow by search term within portfolio',
        description:
          'search_term is intersected with the portfolio scope; here only properties under portfolio X whose name contains "Hilton" (or whose expedia/booking/agoda id matches if numeric).',
        value: {
          search_mode: 'portfolio',
          portfolio_id: '65f0a3c4e2b7a1d2c3e4f5a6',
          search_term: 'Hilton',
          page: 1,
          limit: 10,
        },
      },

      // ─────────────────────────── OTAs ────────────────────────────────────
      c01_ota_single_expedia: {
        summary: '10) OTAs — single (Expedia only)',
        value: {
          search_mode: 'property',
          ota_providers: ['Expedia'],
          page: 1,
          limit: 10,
        },
      },
      c02_ota_multi: {
        summary: '11) OTAs — multi-select (Expedia + Booking)',
        description:
          'Omit ota_providers (or pass an empty array) to include all OTAs.',
        value: {
          search_mode: 'property',
          ota_providers: ['Expedia', 'Booking'],
          page: 1,
          limit: 10,
        },
      },

      // ─────────────────────────── Job types ───────────────────────────────
      d01_job_type_vcc: {
        summary: '12) Job Type — VCC only',
        description: 'Matches Job.billing_type = "VCC" (case-insensitive).',
        value: {
          search_mode: 'property',
          job_types: ['VCC'],
          page: 1,
          limit: 10,
        },
      },
      d02_job_type_db: {
        summary: '13) Job Type — DB only',
        description: 'Matches Job.billing_type = "DB" (case-insensitive).',
        value: {
          search_mode: 'property',
          job_types: ['DB'],
          page: 1,
          limit: 10,
        },
      },
      d03_job_type_combined: {
        summary: '14) Job Type — VCC + DB',
        description:
          'Multi-select returns matching Jobs from both billing_types in ' +
          'one list. (`Retrieval` is no longer supported by this endpoint; ' +
          'sending it is silently ignored.)',
        value: {
          search_mode: 'property',
          job_types: ['VCC', 'DB'],
          page: 1,
          limit: 10,
        },
      },

      // ─────────────────────────── Run within (updatedAt) ──────────────────
      e01_run_within_quarter: {
        summary: '15) Run within — updatedAt between two dates',
        description:
          'Filters by Job.updatedAt. `to` is inclusive to end-of-day. Either bound may be omitted for open-ended ranges.',
        value: {
          search_mode: 'property',
          run_within: {
            from: '2026-01-01',
            to: '2026-03-31',
          },
          page: 1,
          limit: 10,
        },
      },

      // ─────────────────────────── Job status ──────────────────────────────
      f01_status_completed: {
        summary: '17) Status — Completed only',
        value: {
          search_mode: 'property',
          job_statuses: ['Completed'],
          page: 1,
          limit: 10,
        },
      },
      f02_status_running: {
        summary: '18) Status — Running only',
        value: {
          search_mode: 'property',
          job_statuses: ['Running'],
          page: 1,
          limit: 10,
        },
      },
      f03_status_in_queue: {
        summary: '19) Status — In Queue (Pending + InQueue)',
        description:
          'Note: the enum value for "In Queue" is `InQueue` (no space). Pair with `Pending` if you want both queues.',
        value: {
          search_mode: 'property',
          job_statuses: ['InQueue', 'Pending'],
          page: 1,
          limit: 10,
        },
      },
      f04_status_failed_partial: {
        summary: '20) Status — Failed + Partial',
        value: {
          search_mode: 'property',
          job_statuses: ['Failed', 'Partial'],
          page: 1,
          limit: 10,
        },
      },
      f05_status_multi: {
        summary: '21) Status — multi-select (all six)',
        value: {
          search_mode: 'property',
          job_statuses: [
            'Completed',
            'Running',
            'InQueue',
            'Partial',
            'Pending',
            'Failed',
          ],
          page: 1,
          limit: 10,
        },
      },

      // ─────────────────────────── Frequency type ──────────────────────────
      g01_frequency_manual: {
        summary: '22) Frequency Type — Manual only',
        description:
          'Matches Job.execution_type in (`Manual`, `manual`). Use when ' +
          'you only want jobs the user explicitly triggered.',
        value: {
          search_mode: 'property',
          frequency_types: ['Manual'],
          page: 1,
          limit: 10,
        },
      },
      g02_frequency_immediate: {
        summary: '23) Frequency Type — Immediate only',
        description:
          'Matches Job.execution_type in (`Immediate`, `immediate`). ' +
          '`Immediate` is the default `execution_type` written by the ' +
          'Excel-import path when no execution-type cell is provided, so ' +
          'this typically captures bulk-imported one-off jobs.',
        value: {
          search_mode: 'property',
          frequency_types: ['immediate'],
          page: 1,
          limit: 10,
        },
      },
      g03_frequency_both: {
        summary: '24) Frequency Type — Manual + Immediate',
        value: {
          search_mode: 'property',
          frequency_types: ['Manual', 'immediate'],
          page: 1,
          limit: 10,
        },
      },

      // ─────────────────────────── Card period ─────────────────────────────
      h01_card_over_160: {
        summary: '25) Card Period — Over 160 only',
        description:
          'Adds the Prisma clause `tags: { some: { field: "over_160", value: true } }` ' +
          '— i.e. returns Jobs whose embedded `tags` array contains an entry ' +
          'with `field = "over_160"` and `value = true` (the DB stores `value` ' +
          'as a Boolean). Currently applies to Jobs only.',
        value: {
          search_mode: 'property',
          card_periods: ['Over160'],
          page: 1,
          limit: 10,
        },
      },
      h02_card_under_160: {
        summary: '26) Card Period — Under 160 only',
        description:
          'Same shape as above but with `value = false`: ' +
          '`tags: { some: { field: "over_160", value: false } }`.',
        value: {
          search_mode: 'property',
          card_periods: ['Under160'],
          page: 1,
          limit: 10,
        },
      },
      h03_card_both: {
        summary: '27) Card Period — Over 160 + Under 160 (both selected)',
        description:
          'How it works: because `over_160` is stored as a Boolean in MongoDB ' +
          '(inside `Job.tags`), the only two possible values are `true` and ' +
          '`false`. Selecting BOTH checkboxes therefore covers the entire ' +
          'value space, so the API drops the `tags` clause from the Prisma ' +
          'query entirely — the result is exactly the same as omitting ' +
          '`card_periods` (or sending it as an empty array `[]`). ' +
          'In particular, rows that don\'t have an `over_160` tag at all ' +
          '(e.g. jobs that haven\'t been evaluated yet) are also included.',
        value: {
          search_mode: 'property',
          card_periods: ['Over160', 'Under160'],
          page: 1,
          limit: 10,
        },
      },

      // ─────────────────────────── Job dates ───────────────────────────────
      i01_job_dates_range: {
        summary: '28) Job Dates Within — start_date / end_date overlap',
        description:
          'Dates use MM/DD/YYYY (or any string parseable as Date). The filter selects rows whose [start_date, end_date] interval overlaps [start, end].',
        value: {
          search_mode: 'property',
          job_dates: {
            start_date: '01/01/2026',
            end_date: '03/31/2026',
          },
          page: 1,
          limit: 10,
        },
      },

      // ─────────────────────────── Batch ───────────────────────────────────
      j01_batch_specific: {
        summary: '29) Batch — specific batch IDs',
        description:
          'Omit batch_ids (or pass an empty array) to search across all batches.',
        value: {
          search_mode: 'property',
          batch_ids: [
            '65f0a3c4e2b7a1d2c3e4f5b1',
            '65f0a3c4e2b7a1d2c3e4f5b2',
          ],
          page: 1,
          limit: 10,
        },
      },

      // ─────────────────────────── Archive ─────────────────────────────────
      k01_include_archived: {
        summary: '30) Include Archived Jobs',
        description:
          'Default is false (archived rows are hidden). Set to true to include them.',
        value: {
          search_mode: 'property',
          include_archived: true,
          page: 1,
          limit: 10,
        },
      },

      // ─────────────────────────── Pagination + sort ───────────────────────
      l01_pagination_and_sort: {
        summary: '31) Custom pagination + sort',
        description:
          'sortBy ∈ {updatedAt, createdAt, start_date, end_date, property_name, job_status}. sortOrder ∈ {asc, desc}.',
        value: {
          search_mode: 'property',
          page: 2,
          limit: 25,
          sortBy: 'property_name',
          sortOrder: 'asc',
        },
      },

      // ─────────────────────────── Everything together ─────────────────────
      z01_all_filters_combined: {
        summary: '32) All filters together — full Parser Global Reports payload',
        description:
          'Showcases every filter the Parser Global Reports screen exposes in a single request body.',
        value: {
          search_mode: 'portfolio',
          portfolio_id: '65f0a3c4e2b7a1d2c3e4f5a6',
          property_ids: [
            '65f0a3c4e2b7a1d2c3e4f5a7',
            '65f0a3c4e2b7a1d2c3e4f5a8',
          ],
          search_term: 'Hilton',
          ota_providers: ['Expedia', 'Booking'],
          job_types: ['VCC', 'DB'],
          run_within: {
            from: '2026-01-01',
            to: '2026-03-31',
          },
          job_statuses: ['Completed', 'Failed'],
          frequency_types: ['Manual', 'immediate'],
          card_periods: ['Over160'],
          job_dates: {
            start_date: '01/01/2026',
            end_date: '03/31/2026',
          },
          batch_ids: ['65f0a3c4e2b7a1d2c3e4f5b1'],
          include_archived: false,
          page: 1,
          limit: 20,
          sortBy: 'updatedAt',
          sortOrder: 'desc',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Reports retrieved successfully',
    type: SearchReportsResponseDto,
    schema: {
      example: {
        statusCode: 200,
        message: 'Reports retrieved successfully',
        data: [
          {
            source: 'job',
            id: '65f0a3c4e2b7a1d2c3e4f601',
            name: 'Moxy Vienna - Jan 2026',
            job_status: 'Completed',
            ota_provider: 'Expedia',
            billing_type: 'DB',
            execution_type: 'Manual',
            portfolio_id: '65f0a3c4e2b7a1d2c3e4f5a6',
            portfolio_name: 'Hilton Group',
            sub_portfolio_id: null,
            sub_portfolio_name: null,
            property_id: '65f0a3c4e2b7a1d2c3e4f5a7',
            property_name: 'Moxy Vienna',
            batch_id: '65f0a3c4e2b7a1d2c3e4f5b1',
            batch_name: 'January 2026 Processing',
            start_date: '01/01/2026',
            end_date: '01/31/2026',
            is_archived: false,
            property: {
              id: '65f0a3c4e2b7a1d2c3e4f5a7',
              name: 'Moxy Vienna',
              expedia_id: 12345678,
              booking_id: null,
              agoda_id: null,
            },
            failed_reason: '',
            screenshot_urls: [],
            tags: [{ field: 'over_160', value: true }],
            createdAt: '2026-01-05T08:12:33.000Z',
            updatedAt: '2026-02-01T09:45:11.000Z',
          },
          {
            source: 'job',
            id: '65f0a3c4e2b7a1d2c3e4f602',
            name: 'Hilton London - Feb 2026',
            job_status: 'Running',
            ota_provider: 'Booking',
            billing_type: 'VCC',
            execution_type: 'Manual',
            portfolio_id: '65f0a3c4e2b7a1d2c3e4f5a6',
            portfolio_name: 'Hilton Group',
            sub_portfolio_id: null,
            sub_portfolio_name: null,
            property_id: '65f0a3c4e2b7a1d2c3e4f5a8',
            property_name: 'Hilton London',
            batch_id: null,
            batch_name: null,
            start_date: '02/01/2026',
            end_date: '02/28/2026',
            is_archived: false,
            property: {
              id: '65f0a3c4e2b7a1d2c3e4f5a8',
              name: 'Hilton London',
              expedia_id: null,
              booking_id: 87654321,
              agoda_id: null,
            },
            failed_reason: '',
            screenshot_urls: [],
            tags: [],
            createdAt: '2026-02-02T11:20:00.000Z',
            updatedAt: '2026-02-12T16:05:42.000Z',
          },
        ],
        metadata: {
          totalDocuments: 41,
          totalJobs: 41,
          currentPage: 1,
          totalPage: 5,
          limit: 10,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: {
      example: {
        statusCode: 400,
        message: 'Validation failed',
        errors: [
          {
            field: 'portfolio_id',
            message: 'Invalid ObjectId format. Must be a 24-character hex string.',
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Valid JWT token required',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        data: null,
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    schema: {
      example: {
        statusCode: 500,
        message: 'Unexpected error while searching reports',
        data: null,
      },
    },
  })
  async searchReports(
    @Req() request: any,
    @Body() body: SearchReportsType,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const user = request.user;
        if (!user) {
          return {
            statusCode: 401,
            message: 'User not authenticated',
            data: null,
          };
        }

        const result = await this.reportsService.searchReports(body, {
          userId: user.userId,
          role: user.role,
        });

        return {
          statusCode: 200,
          message: 'Reports retrieved successfully',
          data: result.data,
          metadata: result.metadata,
        };
      },
      this.logger,
    );
  }

  @Post('/global/statistics')
  @UseGuards(JwtAuthGuard)
  @ValidateBody(searchReportsSchema)
  @ApiOperation({
    summary: 'Get report statistics',
    description:
      'Returns job counts by status (`currentCounts`) for the same filter set ' +
      'as `POST /reports/global`. Accepts the identical request body — all ' +
      'fields are optional and independent. Non-admin users are automatically ' +
      'scoped to their `UserFeatureAccessPermission` entries.',
  })
  @ApiBody({ type: SearchReportsRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Report statistics retrieved successfully',
    type: ReportsStatisticsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getStatistics(@Req() request: any, @Body() body: any, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const userId = request.user?.userId;
        const userRole = request.user?.role;

        if (!userId) {
          return {
            statusCode: 401,
            message: 'User not authenticated',
            data: null,
          };
        }

        const data = await this.reportsService.getStatistics(body, {
          userId,
          role: userRole,
        });

        return {
          statusCode: 200,
          message: 'Report statistics retrieved successfully',
          data,
        };
      },
      this.logger,
    );
  }

  @Post('/global/ids')
  @UseGuards(JwtAuthGuard)
  @ValidateBody(searchReportsSchema)
  @ApiOperation({
    summary:
      'List ALL matching job_ids (for "Download All" → /reports/export-master)',
    description:
      'Accepts the **same body shape** as `POST /reports/global` (every ' +
      'filter behaves identically), but ignores pagination and returns the ' +
      'complete set of matching Job IDs.\n\n' +
      'Intended flow for the Reports → "Download as Zip" → "Download All" action:\n' +
      '  1. Frontend POSTs the current filter payload here.\n' +
      '  2. Backend returns `{ data: { job_ids }, metadata }`.\n' +
      '  3. Frontend POSTs `{ job_ids }` to `POST /reports/export-master` ' +
      '     (or the legacy `POST /jobs/export-master`) which streams a ZIP.\n\n' +
      'Pagination/sort fields (`page`, `limit`, `sortBy`, `sortOrder`) are ' +
      'accepted (so the frontend can resend the exact same payload) — ' +
      '`page` and `limit` are ignored; `sortBy` / `sortOrder` still control ' +
      'the order of the returned ID array so the export reflects the ' +
      'same ordering the user sees on screen.\n\n' +
      'Non-admin users are scoped to their `UserFeatureAccessPermission` ' +
      'entries — they can never receive IDs they could not see via ' +
      '`POST /reports/global`.',
  })
  @ApiBody({
    type: SearchReportsRequestDto,
    examples: {
      ids_minimal: {
        summary: '01) Minimal — every job the user can see',
        description:
          'Returns ALL matching IDs the caller has access to. Equivalent ' +
          'to running `/reports/global` with no filters and no pagination.',
        value: { search_mode: 'property' },
      },
      ids_property_term: {
        summary: '02) Property mode — filtered by property name',
        description:
          'Same payload as a paginated search; pagination fields are ' +
          'simply ignored here.',
        value: {
          search_mode: 'property',
          search_term: 'Moxy',
          page: 1,
          limit: 10,
        },
      },
      ids_portfolio_all: {
        summary: '03) Portfolio mode — every job under a portfolio',
        value: {
          search_mode: 'portfolio',
          portfolio_id: '65f0a3c4e2b7a1d2c3e4f5b1',
        },
      },
      ids_explicit_billing_types: {
        summary: '04) Restrict by billing type — VCC + DB',
        description:
          'Identical effect to leaving `job_types` empty (the endpoint ' +
          'always queries the Job collection only), but documents the ' +
          'explicit form the frontend usually sends.',
        value: {
          search_mode: 'property',
          job_types: ['VCC', 'DB'],
        },
      },
      ids_with_status_and_dates: {
        summary: '05) Failed jobs in a date window',
        description:
          'Real-world "download all failures from Feb 2026" use case. ' +
          'Combines `job_statuses`, `job_dates` (post-filtered against ' +
          'MM/DD/YYYY strings) and the default OTA list.',
        value: {
          search_mode: 'property',
          job_statuses: ['Failed'],
          job_dates: {
            start_date: '02/01/2026',
            end_date: '02/28/2026',
          },
        },
      },
      ids_batch: {
        summary: '06) Single batch — export everything in that batch',
        value: {
          search_mode: 'property',
          batch_ids: ['65f0a3c4e2b7a1d2c3e4f5c1'],
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Matching IDs retrieved successfully',
    type: SearchReportIdsResponseDto,
    schema: {
      example: {
        statusCode: 200,
        message: 'Matching report IDs retrieved successfully',
        data: {
          job_ids: [
            '65f0a3c4e2b7a1d2c3e4f5a6',
            '65f0a3c4e2b7a1d2c3e4f5a7',
            '65f0a3c4e2b7a1d2c3e4f5a8',
          ],
        },
        metadata: {
          totalJobs: 41,
          totalDocuments: 41,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: {
      example: {
        statusCode: 400,
        message: 'Validation failed',
        errors: [
          {
            field: 'portfolio_id',
            message: 'Invalid ObjectId format. Must be a 24-character hex string.',
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Valid JWT token required',
    schema: {
      example: { statusCode: 401, message: 'Unauthorized', data: null },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    schema: {
      example: {
        statusCode: 500,
        message: 'Unexpected error while fetching report IDs',
        data: null,
      },
    },
  })
  async searchReportIds(
    @Req() request: any,
    @Body() body: SearchReportsType,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const user = request.user;
        if (!user) {
          return {
            statusCode: 401,
            message: 'User not authenticated',
            data: null,
          };
        }

        const result = await this.reportsService.searchReportIds(body, {
          userId: user.userId,
          role: user.role,
        });

        return {
          statusCode: 200,
          message: 'Matching report IDs retrieved successfully',
          data: {
            job_ids: result.job_ids,
          },
          metadata: result.metadata,
        };
      },
      this.logger,
    );
  }

  @Post('/export-master')
  @UseGuards(JwtAuthGuard)
  @ValidateBody(exportReportsMasterSchema)
  @ApiOperation({
    summary: 'Download as ZIP — Jobs master export (XLSX per job)',
    description:
      'Accepts an array of `job_ids` and returns a single ZIP file ' +
      'containing one XLSX per job.\n\n' +
      '### Sync vs Async (job count threshold)\n' +
      '- **≤ 10 jobs** → built synchronously; the response body is the ' +
      '  ZIP (`Content-Type: application/zip`). Same as before.\n' +
      '- **> 10 jobs** → pushed to SQS and built in the background. The ' +
      '  response is `202 Accepted` JSON and a download link is emailed ' +
      '  to the JWT-bound user when ready (presigned S3 URL, 7-day ' +
      '  expiry). This avoids nginx `proxy_read_timeout` (60 s default) ' +
      '  blowing up on large exports.\n\n' +
      'Each XLSX uses the same columns and per-OTA logic as ' +
      '`POST /jobs/export-master`, but is rendered as XLSX with Card ' +
      'Number / Expiry date / CVV columns forced to Excel "Text" format ' +
      'so leading zeros and long digit strings are preserved.\n\n' +
      '`job_ids` must contain at least one ID — sending an empty array ' +
      'is rejected with 400.\n\n' +
      'Inside the ZIP each file is named ' +
      '`{OTA}-{property}-{startDate}-{endDate}.xlsx`. Collisions are ' +
      'disambiguated with a `-2`, `-3` suffix so nothing gets ' +
      'overwritten.\n\n' +
      'The ZIP itself is named ' +
      '`reports-export-{D Month YYYY-HH.MM AM/PM}.zip`. A dot is used ' +
      'instead of `:` so the filename is valid on every OS.\n\n' +
      '**Recommended frontend flow ("Download All"):**\n' +
      '1. `POST /reports/global/ids` with the current Reports filter ' +
      '   payload → `{ job_ids }`.\n' +
      '2. `POST /reports/export-master` with `{ job_ids }` → ZIP downloads.',
  })
  @ApiBody({
    type: ExportReportsMasterRequestDto,
    examples: {
      single_job: {
        summary: '01) Single job',
        description: 'Smallest valid payload — a single job exported as a one-entry ZIP.',
        value: {
          job_ids: ['65f0a3c4e2b7a1d2c3e4f5a6'],
        },
      },
      multiple_jobs: {
        summary: '02) Multiple jobs (typical "Download All")',
        description:
          'Typical payload after a `/reports/global/ids` call — paste the ' +
          'returned `data.job_ids` array verbatim.',
        value: {
          job_ids: [
            '65f0a3c4e2b7a1d2c3e4f5a6',
            '65f0a3c4e2b7a1d2c3e4f5a7',
            '65f0a3c4e2b7a1d2c3e4f5a8',
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description:
      'ZIP file (sync path, ≤ 10 jobs). Response Content-Type is ' +
      '`application/zip` and `Content-Disposition` carries the suggested ' +
      'filename.',
    content: { 'application/zip': {} },
  })
  @ApiResponse({
    status: 202,
    description:
      'Async path (> 10 jobs). Request accepted and queued — a download ' +
      'link will be emailed to the JWT-bound user when the ZIP is ready.',
    schema: {
      example: {
        statusCode: 202,
        message:
          "Your export is being prepared. We will email a download link to user@example.com when it's ready (usually within a few minutes).",
        data: {
          queued: true,
          exportType: 'master',
          email: 'user@example.com',
          jobIdsCount: 137,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (empty `job_ids` or malformed IDs)',
    schema: {
      example: {
        statusCode: 400,
        message: 'Validation failed',
        errors: [
          {
            field: 'job_ids',
            message: 'At least one job ID is required',
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Valid JWT token required',
    schema: {
      example: { statusCode: 401, message: 'Unauthorized', data: null },
    },
  })
  @ApiResponse({
    status: 404,
    description:
      'No exportable content for the provided IDs (jobs exist but have ' +
      'no items, or every ID was missing).',
    schema: {
      example: {
        statusCode: 404,
        message: 'No exportable content found for the provided job IDs',
        data: null,
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    schema: {
      example: {
        statusCode: 500,
        message: 'Unexpected error while exporting reports',
        data: null,
      },
    },
  })
  async exportReportsMaster(
    @Req() request: any,
    @Body() body: ExportReportsMasterType,
    @Res() response: Response,
  ) {
    try {
      if (!request.user) {
        response.status(401).json({
          statusCode: 401,
          message: 'User not authenticated',
          data: null,
        });
        return;
      }

      // Large exports (>10 jobs) are pushed to SQS and the file is
      // emailed when ready. Small exports stay on the synchronous path
      // below so the frontend can offer instant downloads for small
      // selections.
      const went =
        await this.tryEnqueueAsyncExport(request, body, 'master', response);
      if (went) return;

      const { buffer, fileName } = await this.reportsService.exportMaster(body);

      response.setHeader('Content-Type', 'application/zip');
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName}"`,
      );
      response.setHeader('Content-Length', buffer.length);
      response.send(buffer);
    } catch (error) {
      this.logger.error(
        `Error in POST /reports/export-master: ${error.message}`,
        error.stack,
      );
      const status =
        typeof error?.getStatus === 'function' ? error.getStatus() : 500;
      response.status(status).json({
        statusCode: status,
        message: error?.message ?? 'Unexpected error while exporting reports',
        data: null,
      });
    }
  }

  @Post('/export-consolidated')
  @UseGuards(JwtAuthGuard)
  @ValidateBody(exportReportsMasterSchema)
  @ApiOperation({
    summary: 'Download Consolidated Report — single XLSX of all selected jobs',
    description:
      'Accepts an array of `job_ids` and returns ONE XLSX file (not a ZIP) ' +
      'where every job\'s items are merged into a single "Master" sheet.\n\n' +
      'Use this when the user wants a single spreadsheet they can scroll ' +
      'through, instead of a ZIP with one file per job (which is what ' +
      '`POST /reports/export-master` produces).\n\n' +
      '### Sync vs Async (job count threshold)\n' +
      '- **≤ 10 jobs** → built synchronously; the response body is the ' +
      '  XLSX.\n' +
      '- **> 10 jobs** → queued via SQS and the resulting XLSX is ' +
      '  emailed as a 7-day presigned S3 link. Response is `202 Accepted` ' +
      '  JSON.\n\n' +
      '### Columns\n' +
      'Same headers and per-OTA rules as `POST /jobs/export-master`:\n' +
      '- `OTA`, `OTA Posting Type`, `OTA ID`, `Batch`, `Review Collection Date`, ' +
      '  `Portfolio`, `Property Name`, `Reservation ID`, `Hotel Confirmation Code`, ' +
      '  `Guest name`, `Check In`, `Check Out`, **`Over 160`**, ' +
      '  **`Number of days since chargeback date ( Today: <date>)`**, ' +
      '  `Charge Before`, `Currency`, `Booking Amount`, `Amount to Charge`, ' +
      '  `Card Status`, `Card Number`, `Expiry date`, `CVV`, `Due to Property`, ' +
      '  `Due to VNP/Invoice`, `Processor (DBMS Based on OTA)`, ' +
      '  `QP Username (From DBMS)`, `Case Contact (From DBMS)`, ' +
      '  `Reporting Contact (From DBMS)`.\n' +
      '- If any of the selected jobs is **Expedia**, the Expedia-only ' +
      '  columns are appended after the static set: `Card Activity`, ' +
      '  `Calculated Amount to Charge`, `Amount Match`, and N × ' +
      '  `Card Activity Approved Amount K` columns (N = maximum approved ' +
      '  authorizations across all Expedia items in the export). ' +
      '  Non-Expedia rows simply leave those cells blank.\n' +
      '- `Card Number`, `Expiry date`, and `CVV` are forced to Excel ' +
      '  "Text" format so leading zeros and long digit strings are ' +
      '  preserved instead of being mangled into scientific notation.\n' +
      '- For **Booking** rows, `Check In` / `Check Out` / `Over 160` / ' +
      '  `Number of days since chargeback date` are all `"N/A"`, ' +
      '  matching the spec for the per-job CSV.\n\n' +
      '### Row ordering\n' +
      'Rows are written in the order the jobs are returned by the ' +
      'database (matching `/reports/global/ids`\'s `sortOrder`), with all ' +
      'items of one job emitted before moving on to the next job. Jobs ' +
      'with no items are silently skipped.\n\n' +
      '### Filename\n' +
      '`consolidated-report-{D Month YYYY-HH.MM AM/PM}.xlsx` (e.g. ' +
      '`consolidated-report-19 May 2026-05.30 PM.xlsx`). A dot replaces ' +
      'the time `:` so the filename is valid on every OS.\n\n' +
      '### Recommended frontend flow\n' +
      '1. `POST /reports/global/ids` with the current Reports filter ' +
      '   payload → `{ job_ids }`.\n' +
      '2. `POST /reports/export-consolidated` with `{ job_ids }` → XLSX ' +
      '   downloads.\n\n' +
      '(If the user instead wants one file per job in a ZIP, hit ' +
      '`POST /reports/export-master` with the same body.)',
  })
  @ApiBody({
    type: ExportReportsMasterRequestDto,
    examples: {
      single_job: {
        summary: '01) Single job',
        description:
          'Smallest valid payload — a single job rendered as a one-job ' +
          'consolidated XLSX.',
        value: {
          job_ids: ['65f0a3c4e2b7a1d2c3e4f5a6'],
        },
      },
      multiple_jobs: {
        summary: '02) Multiple jobs (typical "Consolidated Report")',
        description:
          'Typical payload after a `/reports/global/ids` call — paste the ' +
          'returned `data.job_ids` array verbatim.',
        value: {
          job_ids: [
            '65f0a3c4e2b7a1d2c3e4f5a6',
            '65f0a3c4e2b7a1d2c3e4f5a7',
            '65f0a3c4e2b7a1d2c3e4f5a8',
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description:
      'XLSX file (sync path, ≤ 10 jobs). Response Content-Type is ' +
      '`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` ' +
      'and `Content-Disposition` carries the suggested filename.',
    content: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {},
    },
  })
  @ApiResponse({
    status: 202,
    description:
      'Async path (> 10 jobs). Request accepted and queued — the ' +
      'consolidated XLSX will be emailed as a 7-day presigned S3 link.',
    schema: {
      example: {
        statusCode: 202,
        message:
          "Your export is being prepared. We will email a download link to user@example.com when it's ready (usually within a few minutes).",
        data: {
          queued: true,
          exportType: 'consolidated',
          email: 'user@example.com',
          jobIdsCount: 137,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (empty `job_ids` or malformed IDs)',
    schema: {
      example: {
        statusCode: 400,
        message: 'Validation failed',
        errors: [
          {
            field: 'job_ids',
            message: 'At least one job ID is required',
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Valid JWT token required',
    schema: {
      example: { statusCode: 401, message: 'Unauthorized', data: null },
    },
  })
  @ApiResponse({
    status: 404,
    description:
      'No exportable content for the provided IDs (no matching job, or ' +
      'matching jobs have no items).',
    schema: {
      example: {
        statusCode: 404,
        message: 'No job items found for the provided job IDs to export',
        data: null,
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    schema: {
      example: {
        statusCode: 500,
        message: 'Unexpected error while exporting consolidated report',
        data: null,
      },
    },
  })
  async exportConsolidatedReport(
    @Req() request: any,
    @Body() body: ExportReportsMasterType,
    @Res() response: Response,
  ) {
    try {
      if (!request.user) {
        response.status(401).json({
          statusCode: 401,
          message: 'User not authenticated',
          data: null,
        });
        return;
      }

      const went = await this.tryEnqueueAsyncExport(
        request,
        body,
        'consolidated',
        response,
      );
      if (went) return;

      const { buffer, fileName } =
        await this.reportsService.exportConsolidated(body);

      response.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName}"`,
      );
      response.setHeader('Content-Length', buffer.length);
      response.send(buffer);
    } catch (error) {
      this.logger.error(
        `Error in POST /reports/export-consolidated: ${error.message}`,
        error.stack,
      );
      const status =
        typeof error?.getStatus === 'function' ? error.getStatus() : 500;
      response.status(status).json({
        statusCode: status,
        message:
          error?.message ??
          'Unexpected error while exporting consolidated report',
        data: null,
      });
    }
  }

  @Post('/export-dashboard')
  @UseGuards(JwtAuthGuard)
  @ValidateBody(exportReportsMasterSchema)
  @ApiOperation({
    summary: 'Download for Dashboard — single XLSX (simplified column spec)',
    description:
      'Accepts an array of `job_ids` and returns ONE XLSX file containing ' +
      'every selected job\'s items rendered with the simplified ' +
      '**Dashboard** column spec — a different (and shorter) layout from ' +
      'the one `POST /reports/export-consolidated` produces.\n\n' +
      'Use this when the user clicks **"Download for Dashboard"** on the ' +
      'Reports page (vs. **"Download as ZIP"** → `/reports/export-master`, ' +
      'or **"Consolidated Report"** → `/reports/export-consolidated`).\n\n' +
      '### Sync vs Async (job count threshold)\n' +
      '- **≤ 10 jobs** → built synchronously; the response body is the ' +
      '  XLSX.\n' +
      '- **> 10 jobs** → queued via SQS; the XLSX is emailed as a 7-day ' +
      '  presigned S3 link. Response is `202 Accepted` JSON.\n\n' +
      '### Columns (in order)\n' +
      '_Headers carry a trailing `*` for required columns, matching the_ ' +
      '_downstream spreadsheet template exactly._\n\n' +
      '1. `OTA*` — `job.ota_provider` (`Expedia` / `Booking` / `Agoda`).\n' +
      '2. `Hotel ID*` — the OTA-specific property ID: ' +
      '   `property.expedia_id` for Expedia jobs, `property.booking_id` ' +
      '   for Booking jobs, `property.agoda_id` for Agoda jobs.\n' +
      '3. `Batch` — `job.batch.name` (falls back to denormalized ' +
      '   `job.batch_name`).\n' +
      '4. `Review/Collection Date` — `job.end_date` formatted as ' +
      '   `"MMM dd, yyyy"` (e.g. `Feb 28, 2026`).\n' +
      '5. `Portfolio*` — `job.portfolio_name` (falls back to ' +
      '   `job.portfolio.name`).\n' +
      '6. `Hotel Name*` — `job.property_name`.\n' +
      '7. `Reservation ID*` — `jobItem.reservation_id`.\n' +
      '8. `Status*` — hard-coded to the literal string `"TBD"` for ' +
      '   every row (no DB source decided yet — will be wired once the ' +
      '   source field is finalized).\n' +
      '9. `Name` — `jobItem.guest_name`.\n' +
      '10. `Check In` — `jobItem.check_in_date` formatted as ' +
      '    `"MMM dd, yyyy"`.\n' +
      '11. `Check Out` — `jobItem.check_out_date` formatted as ' +
      '    `"MMM dd, yyyy"`.\n' +
      '12. `Currency*` — ' +
      '    `jobItem.payment_info.amount_to_charge_or_refund_currency` ' +
      '    (defaults to `"USD"` when missing).\n' +
      '13. `Amount Collected*` — ' +
      '    `jobItem.payment_info.amount_to_charge_or_refund`.\n' +
      '14. `Due To Property*` — `Amount Collected × 0.85`, rounded to 4 ' +
      '    decimals. **Expedia and Booking only** — `"N/A"` for Agoda ' +
      '    rows or when `Amount Collected` is missing / non-numeric.\n' +
      '15. `Due To VNP*` — `Amount Collected × 0.15`, rounded to 4 ' +
      '    decimals. Same Expedia / Booking eligibility as ' +
      '    `Due To Property*`.\n\n' +
      '### Row ordering\n' +
      'Rows are emitted in the order the jobs come back from the database ' +
      '(driven by the optional `sortBy` / `sortOrder` the frontend used to ' +
      'fetch `/reports/global/ids`). All items of one job are written ' +
      'before moving to the next. Jobs with zero items are skipped.\n\n' +
      '### Filename\n' +
      '`dashboard-report-{D Month YYYY-HH.MM AM/PM}.xlsx` (e.g. ' +
      '`dashboard-report-21 May 2026-01.16 PM.xlsx`).\n\n' +
      '### Recommended frontend flow\n' +
      '1. `POST /reports/global/ids` with the current Reports filter ' +
      '   payload → `{ job_ids }`.\n' +
      '2. `POST /reports/export-dashboard` with `{ job_ids }` → XLSX ' +
      '   downloads.',
  })
  @ApiBody({
    type: ExportReportsMasterRequestDto,
    examples: {
      single_job: {
        summary: '01) Single job',
        description:
          'Smallest valid payload — a single job rendered as a one-job ' +
          'dashboard XLSX.',
        value: {
          job_ids: ['65f0a3c4e2b7a1d2c3e4f5a6'],
        },
      },
      multiple_jobs: {
        summary: '02) Multiple jobs (typical "Download for Dashboard")',
        description:
          'Typical payload after a `/reports/global/ids` call — paste the ' +
          'returned `data.job_ids` array verbatim.',
        value: {
          job_ids: [
            '65f0a3c4e2b7a1d2c3e4f5a6',
            '65f0a3c4e2b7a1d2c3e4f5a7',
            '65f0a3c4e2b7a1d2c3e4f5a8',
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description:
      'XLSX file (sync path, ≤ 10 jobs). Response Content-Type is ' +
      '`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` ' +
      'and `Content-Disposition` carries the suggested filename.',
    content: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {},
    },
  })
  @ApiResponse({
    status: 202,
    description:
      'Async path (> 10 jobs). Request accepted and queued — the ' +
      'dashboard XLSX will be emailed as a 7-day presigned S3 link.',
    schema: {
      example: {
        statusCode: 202,
        message:
          "Your export is being prepared. We will email a download link to user@example.com when it's ready (usually within a few minutes).",
        data: {
          queued: true,
          exportType: 'dashboard',
          email: 'user@example.com',
          jobIdsCount: 137,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (empty `job_ids` or malformed IDs)',
    schema: {
      example: {
        statusCode: 400,
        message: 'Validation failed',
        errors: [
          {
            field: 'job_ids',
            message: 'At least one job ID is required',
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Valid JWT token required',
    schema: {
      example: { statusCode: 401, message: 'Unauthorized', data: null },
    },
  })
  @ApiResponse({
    status: 404,
    description:
      'No exportable content for the provided IDs (no matching job, or ' +
      'matching jobs have no items).',
    schema: {
      example: {
        statusCode: 404,
        message: 'No job items found for the provided job IDs to export',
        data: null,
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    schema: {
      example: {
        statusCode: 500,
        message: 'Unexpected error while exporting dashboard report',
        data: null,
      },
    },
  })
  async exportDashboardReport(
    @Req() request: any,
    @Body() body: ExportReportsMasterType,
    @Res() response: Response,
  ) {
    try {
      if (!request.user) {
        response.status(401).json({
          statusCode: 401,
          message: 'User not authenticated',
          data: null,
        });
        return;
      }

      const went = await this.tryEnqueueAsyncExport(
        request,
        body,
        'dashboard',
        response,
      );
      if (went) return;

      const { buffer, fileName } =
        await this.reportsService.exportDashboard(body);

      response.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName}"`,
      );
      response.setHeader('Content-Length', buffer.length);
      response.send(buffer);
    } catch (error) {
      this.logger.error(
        `Error in POST /reports/export-dashboard: ${error.message}`,
        error.stack,
      );
      const status =
        typeof error?.getStatus === 'function' ? error.getStatus() : 500;
      response.status(status).json({
        statusCode: status,
        message:
          error?.message ??
          'Unexpected error while exporting dashboard report',
        data: null,
      });
    }
  }
}
