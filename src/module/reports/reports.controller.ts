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
  SearchReportsRequestDto,
  SearchReportsResponseDto,
} from './reports.dto';
import { IReportsService } from './reports.interface';
import {
  searchReportsSchema,
  type SearchReportsType,
} from './reports.validation';

@ApiTags('Reports')
@ApiBearerAuth('JWT-auth')
@Controller('/reports')
export class ReportsController {
  constructor(
    @Inject('IReportsService')
    private readonly reportsService: IReportsService,
    private readonly logger: Logger,
  ) {}

  @Post('/global')
  @UseGuards(JwtAuthGuard)
  @ValidateBody(searchReportsSchema)
  @ApiOperation({
    summary: 'Search Parser Global Reports (jobs + retrievals)',
    description:
      'Unified search for the Parser Global Reports screen. Returns a single ' +
      'merged paginated list combining Jobs (VCC / DB) and Retrievals filtered ' +
      'by:\n' +
      '- `search_mode` + `search_term` + `portfolio_id` + `property_ids` (the ' +
      '  "Retrieve reports for" selector)\n' +
      '- `ota_providers` (Expedia / Booking / Agoda)\n' +
      '- `job_types` (VCC / DB → Job collection by `billing_type`; Retrieval → ' +
      '  the Retrieval collection)\n' +
      '- `run_within` → `updatedAt` range\n' +
      '- `job_statuses`, `frequency_types`, `card_periods` (Job-only), ' +
      '`batch_ids`\n' +
      '- `job_dates` → Job/Retrieval `start_date` / `end_date` overlap\n' +
      '- `include_archived`\n\n' +
      'Non-admin users are automatically scoped to their ' +
      '`UserFeatureAccessPermission` entries.',
  })
  @ApiBody({
    type: SearchReportsRequestDto,
    examples: {
      // ─────────────────────────── Search basics ───────────────────────────
      a01_minimal_property: {
        summary: '01) Minimal — Property mode, no filters',
        description:
          'Smallest valid request. Returns every job/retrieval the user can see, sorted by updatedAt desc.',
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
          'No search_term and no property_ids → every job/retrieval for any property under the portfolio (direct or via sub-portfolio).',
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
      d03_job_type_retrieval: {
        summary: '14) Job Type — Retrieval only',
        description:
          'Restricts the search to the Retrieval collection (Jobs are excluded).',
        value: {
          search_mode: 'property',
          job_types: ['Retrieval'],
          page: 1,
          limit: 10,
        },
      },
      d04_job_type_combined: {
        summary: '15) Job Type — VCC + DB + Retrieval',
        description:
          'Multi-select returns matching Jobs AND matching Retrievals in one merged list.',
        value: {
          search_mode: 'property',
          job_types: ['VCC', 'DB', 'Retrieval'],
          page: 1,
          limit: 10,
        },
      },

      // ─────────────────────────── Run within (updatedAt) ──────────────────
      e01_run_within_quarter: {
        summary: '16) Run within — updatedAt between two dates',
        description:
          'Filters by Job/Retrieval.updatedAt. `to` is inclusive to end-of-day. Either bound may be omitted for open-ended ranges.',
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
        description: 'Matches Job.execution_type = "Manual".',
        value: {
          search_mode: 'property',
          frequency_types: ['Manual'],
          page: 1,
          limit: 10,
        },
      },
      g02_frequency_recurring: {
        summary: '23) Frequency Type — Recurring only',
        description: 'Matches Job.execution_type = "Recurring".',
        value: {
          search_mode: 'property',
          frequency_types: ['Recurring'],
          page: 1,
          limit: 10,
        },
      },
      g03_frequency_both: {
        summary: '24) Frequency Type — Manual + Recurring',
        value: {
          search_mode: 'property',
          frequency_types: ['Manual', 'Recurring'],
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
          job_types: ['VCC', 'DB', 'Retrieval'],
          run_within: {
            from: '2026-01-01',
            to: '2026-03-31',
          },
          job_statuses: ['Completed', 'Failed'],
          frequency_types: ['Manual', 'Recurring'],
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
            createdAt: '2026-01-05T08:12:33.000Z',
            updatedAt: '2026-02-01T09:45:11.000Z',
          },
          {
            source: 'retrieval',
            id: '65f0a3c4e2b7a1d2c3e4f701',
            name: 'Hilton London - Feb 2026 Retrieval',
            job_status: 'Running',
            ota_provider: 'Booking',
            billing_type: null,
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
            createdAt: '2026-02-02T11:20:00.000Z',
            updatedAt: '2026-02-12T16:05:42.000Z',
          },
        ],
        metadata: {
          totalDocuments: 47,
          totalJobs: 41,
          totalRetrievals: 6,
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
            message: 'portfolio_id is required when search_mode is "portfolio"',
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
}
