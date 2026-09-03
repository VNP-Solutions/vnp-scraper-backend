import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Put,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PostingType } from '@prisma/client';
import { Response } from 'express';
import { ParseQuery } from 'src/common/decorators/parse-query.decorator';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { ZodValidationPipe } from 'src/common/pipes/validation.pipe';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AgodaCaseItemListResponseDto,
  AgodaCaseItemResponseDto,
  BulkDeclineAgodaCaseItemsDto,
  BulkDeclineAgodaCaseItemsResponseDto,
  CreateAgodaCaseItemDto,
  ExportSelectedAgodaCaseItemsDto,
  UpdateAgodaCaseItemDto,
} from './agoda-case-item.dto';
import {
  AgodaCaseItemFilters,
  IAgodaCaseItemService,
} from './agoda-case-item.interface';
import {
  bulkDeclineAgodaCaseItemsSchema,
  createAgodaCaseItemSchema,
  exportSelectedAgodaCaseItemsSchema,
  updateAgodaCaseItemSchema,
} from './agoda-case-item.validation';

@ApiTags('Agoda Case Items')
@ApiBearerAuth('JWT-auth')
@Controller('agoda-case-items')
@UseGuards(JwtAuthGuard)
export class AgodaCaseItemController {
  private readonly logger = new Logger(AgodaCaseItemController.name);

  constructor(
    @Inject('IAgodaCaseItemService')
    private readonly agodaCaseItemService: IAgodaCaseItemService,
  ) {}

  /** Shared between GET / and GET /export/wip so the two never drift apart. */
  private buildFiltersFromQuery(
    query: Record<string, any>,
  ): AgodaCaseItemFilters {
    const filters: AgodaCaseItemFilters = {};
    const {
      search,
      ids,
      property_id,
      batch_id,
      portfolio_id,
      retrival_status,
      charge_status,
      is_missing,
      posting_type,
      createdBy,
      is_archived,
      is_declined,
      page,
      limit,
      order,
    } = query;

    if (search) filters.search = search;
    if (ids) {
      // Accepts either a comma-separated string (?ids=a,b,c) or repeated
      // params (?ids=a&ids=b), depending on how the frontend serializes it.
      const idList = Array.isArray(ids) ? ids : String(ids).split(',');
      const cleaned = idList.map((id) => id.trim()).filter(Boolean);
      if (cleaned.length > 0) filters.ids = cleaned;
    }
    if (property_id) filters.property_id = property_id;
    if (batch_id) filters.batch_id = batch_id;
    if (portfolio_id) filters.portfolio_id = portfolio_id;
    if (retrival_status) filters.retrival_status = retrival_status;
    if (charge_status) filters.charge_status = charge_status;
    if (is_missing !== undefined)
      filters.is_missing = is_missing === true || is_missing === 'true';
    if (posting_type) filters.posting_type = posting_type;
    if (createdBy) filters.createdBy = createdBy;
    if (is_archived !== undefined)
      filters.is_archived = is_archived === true || is_archived === 'true';
    if (is_declined !== undefined)
      filters.is_declined = is_declined === true || is_declined === 'true';
    if (page) filters.page = page;
    if (limit) filters.limit = limit;
    if (order) filters.order = order;

    return filters;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new agoda case item' })
  @ApiResponse({
    status: 201,
    description: 'Agoda case item created successfully',
    type: AgodaCaseItemResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({
    status: 404,
    description: 'Property, batch, portfolio or user not found',
  })
  @ValidateBody(createAgodaCaseItemSchema)
  async create(
    @Body() body: CreateAgodaCaseItemDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const item = await this.agodaCaseItemService.create(body);
        return {
          statusCode: 201,
          message: 'Agoda case item created successfully',
          data: item,
        };
      },
      this.logger,
    );
  }

  @Get('export/wip')
  @ApiOperation({
    summary: 'Export agoda case items as a WIP xlsx sheet',
    description:
      'Exports every AgodaCaseItem matching the given filters (same filters as GET / — omit all of them to export everything) ' +
      'as an .xlsx file for hand-off to whoever charges/collects each card. No pagination — always the full matching set.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by ID, reservation_id, guest_name, vcc_card_number, property name, or portfolio name',
  })
  @ApiQuery({
    name: 'property_id',
    required: false,
    description: 'Filter by property ID',
  })
  @ApiQuery({
    name: 'batch_id',
    required: false,
    description: 'Filter by batch ID',
  })
  @ApiQuery({
    name: 'portfolio_id',
    required: false,
    description: 'Filter by portfolio ID',
  })
  @ApiQuery({
    name: 'retrival_status',
    required: false,
    description: 'Filter by retrieval status',
  })
  @ApiQuery({
    name: 'charge_status',
    required: false,
    description: 'Filter by charge status',
  })
  @ApiQuery({
    name: 'is_missing',
    required: false,
    type: Boolean,
    description: 'Filter by missing flag',
  })
  @ApiQuery({
    name: 'posting_type',
    required: false,
    enum: PostingType,
    description: 'Filter by posting type',
  })
  @ApiQuery({
    name: 'createdBy',
    required: false,
    description: 'Filter by the user (MongoDB ObjectId) who created the item',
  })
  @ApiQuery({
    name: 'is_archived',
    required: false,
    type: Boolean,
    description: 'Filter by archived flag (defaults to no filter — returns both)',
  })
  @ApiQuery({
    name: 'is_declined',
    required: false,
    type: Boolean,
    description: 'Filter by declined flag (defaults to no filter — returns both)',
  })
  @ApiResponse({ status: 200, description: 'xlsx file generated successfully' })
  async exportWip(
    @ParseQuery() query: Record<string, any>,
    @Res() response: Response,
  ) {
    const filters = this.buildFiltersFromQuery(query);
    const { buffer, fileName } =
      await this.agodaCaseItemService.exportWip(filters);

    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`,
    );
    response.send(buffer);
  }

  @Post('export/selected')
  @ApiOperation({
    summary: 'Export specific agoda case items (checked rows) as a WIP xlsx sheet',
    description:
      'For exporting a user-picked selection instead of a filtered set — send exactly the ids the frontend has checked. ' +
      'Same xlsx shape as GET /export/wip, just scoped to these rows.',
  })
  @ApiBody({ type: ExportSelectedAgodaCaseItemsDto })
  @ApiResponse({ status: 200, description: 'xlsx file generated successfully' })
  @ApiResponse({ status: 400, description: 'ids missing, not an array, or empty' })
  @ValidateBody(exportSelectedAgodaCaseItemsSchema)
  async exportSelected(
    @Body() body: ExportSelectedAgodaCaseItemsDto,
    @Res() response: Response,
  ) {
    const { buffer, fileName } = await this.agodaCaseItemService.exportWip({
      ids: body.ids,
    });

    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`,
    );
    response.send(buffer);
  }

  @Get('export/wip-archive')
  @ApiOperation({
    summary: 'Export agoda case items as a WIP xlsx sheet, then archive them',
    description:
      'Identical to GET /export/wip (same filters, omit all of them to export everything), except every row that ends up ' +
      'in the file also gets is_archived set to true right after the file is built — so exporting doubles as archiving.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by ID, reservation_id, guest_name, vcc_card_number, property name, or portfolio name',
  })
  @ApiQuery({
    name: 'property_id',
    required: false,
    description: 'Filter by property ID',
  })
  @ApiQuery({
    name: 'batch_id',
    required: false,
    description: 'Filter by batch ID',
  })
  @ApiQuery({
    name: 'portfolio_id',
    required: false,
    description: 'Filter by portfolio ID',
  })
  @ApiQuery({
    name: 'retrival_status',
    required: false,
    description: 'Filter by retrieval status',
  })
  @ApiQuery({
    name: 'charge_status',
    required: false,
    description: 'Filter by charge status',
  })
  @ApiQuery({
    name: 'is_missing',
    required: false,
    type: Boolean,
    description: 'Filter by missing flag',
  })
  @ApiQuery({
    name: 'posting_type',
    required: false,
    enum: PostingType,
    description: 'Filter by posting type',
  })
  @ApiQuery({
    name: 'createdBy',
    required: false,
    description: 'Filter by the user (MongoDB ObjectId) who created the item',
  })
  @ApiQuery({
    name: 'is_archived',
    required: false,
    type: Boolean,
    description:
      'Filter by archived flag (defaults to no filter — returns both). Note: whatever comes back WILL be set to true after export, regardless of its value going in.',
  })
  @ApiQuery({
    name: 'is_declined',
    required: false,
    type: Boolean,
    description: 'Filter by declined flag (defaults to no filter — returns both)',
  })
  @ApiResponse({
    status: 200,
    description:
      'xlsx file generated successfully. X-Archived-Count response header carries how many rows were archived.',
  })
  async exportWipAndArchive(
    @ParseQuery() query: Record<string, any>,
    @Res() response: Response,
  ) {
    const filters = this.buildFiltersFromQuery(query);
    const { buffer, fileName, archivedCount } =
      await this.agodaCaseItemService.exportWipAndArchive(filters);

    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`,
    );
    response.setHeader('X-Archived-Count', String(archivedCount));
    response.send(buffer);
  }

  @Post('export/selected-archive')
  @ApiOperation({
    summary:
      'Export specific agoda case items (checked rows) as a WIP xlsx sheet, then archive them',
    description:
      'Identical to POST /export/selected (send exactly the ids the frontend has checked), except every one of those ids ' +
      'also gets is_archived set to true right after the file is built.',
  })
  @ApiBody({ type: ExportSelectedAgodaCaseItemsDto })
  @ApiResponse({
    status: 200,
    description:
      'xlsx file generated successfully. X-Archived-Count response header carries how many rows were archived.',
  })
  @ApiResponse({ status: 400, description: 'ids missing, not an array, or empty' })
  @ValidateBody(exportSelectedAgodaCaseItemsSchema)
  async exportSelectedAndArchive(
    @Body() body: ExportSelectedAgodaCaseItemsDto,
    @Res() response: Response,
  ) {
    const { buffer, fileName, archivedCount } =
      await this.agodaCaseItemService.exportWipAndArchive({
        ids: body.ids,
      });

    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`,
    );
    response.setHeader('X-Archived-Count', String(archivedCount));
    response.send(buffer);
  }

  @Post('bulk-decline')
  @ApiOperation({
    summary: 'Mark multiple agoda case items as declined',
    description:
      'Takes an array of AgodaCaseItem IDs and marks them as declined by setting charge_status to "declined" and is_declined to true.',
  })
  @ApiBody({ type: BulkDeclineAgodaCaseItemsDto })
  @ApiResponse({
    status: 200,
    description: 'Items successfully marked as declined',
    type: BulkDeclineAgodaCaseItemsResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid input',
  })
  @UsePipes(new ZodValidationPipe(bulkDeclineAgodaCaseItemsSchema))
  async bulkDecline(
    @Body() body: BulkDeclineAgodaCaseItemsDto,
  ): Promise<BulkDeclineAgodaCaseItemsResponseDto> {
    const declinedCount = await this.agodaCaseItemService.bulkDecline(body.ids);
    return {
      declinedCount,
      message: `Successfully marked ${declinedCount} item(s) as declined`,
    };
  }

  @Get()
  @ApiOperation({
    summary: 'Get all agoda case items with pagination, search and filters',
    description:
      'Filterable by charge_status, ota_provider, createdBy (user), portfolio_id, property_id, batch_id, is_archived and is_declined. ' +
      'search matches against id, reservation_id, guest_name or vcc_card_number.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by ID, reservation_id, guest_name, vcc_card_number, property name, or portfolio name',
  })
  @ApiQuery({
    name: 'property_id',
    required: false,
    description: 'Filter by property ID',
  })
  @ApiQuery({
    name: 'batch_id',
    required: false,
    description: 'Filter by batch ID',
  })
  @ApiQuery({
    name: 'portfolio_id',
    required: false,
    description: 'Filter by portfolio ID',
  })
  @ApiQuery({
    name: 'retrival_status',
    required: false,
    description: 'Filter by retrieval status',
  })
  @ApiQuery({
    name: 'charge_status',
    required: false,
    description: 'Filter by charge status',
  })
  @ApiQuery({
    name: 'is_missing',
    required: false,
    type: Boolean,
    description: 'Filter by missing flag',
  })
  @ApiQuery({
    name: 'posting_type',
    required: false,
    enum: PostingType,
    description: 'Filter by posting type',
  })
  @ApiQuery({
    name: 'createdBy',
    required: false,
    description: 'Filter by the user (MongoDB ObjectId) who created the item',
  })
  @ApiQuery({
    name: 'is_archived',
    required: false,
    type: Boolean,
    description: 'Filter by archived flag (defaults to no filter — returns both)',
  })
  @ApiQuery({
    name: 'is_declined',
    required: false,
    type: Boolean,
    description: 'Filter by declined flag (defaults to no filter — returns both)',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page',
    example: 10,
  })
  @ApiQuery({
    name: 'order',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort order',
    example: 'desc',
  })
  @ApiResponse({
    status: 200,
    description: 'Agoda case items retrieved successfully',
    type: AgodaCaseItemListResponseDto,
  })
  async findAll(
    @ParseQuery() query: Record<string, any>,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const filters = this.buildFiltersFromQuery(query);

        const result = await this.agodaCaseItemService.findAll(filters);

        return {
          statusCode: 200,
          message: 'Agoda case items retrieved successfully',
          data: result.items,
          metadata: {
            totalDocuments: result.totalDocuments,
            currentPage: result.currentPage,
            totalPage: result.totalPage,
            limit: result.limit,
          },
        };
      },
      this.logger,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an agoda case item by ID' })
  @ApiParam({ name: 'id', description: 'Agoda case item ID' })
  @ApiResponse({
    status: 200,
    description: 'Agoda case item retrieved successfully',
    type: AgodaCaseItemResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Agoda case item not found' })
  async findById(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const item = await this.agodaCaseItemService.findById(id);
        return {
          statusCode: 200,
          message: 'Agoda case item retrieved successfully',
          data: item,
        };
      },
      this.logger,
    );
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an agoda case item' })
  @ApiParam({ name: 'id', description: 'Agoda case item ID' })
  @ApiResponse({
    status: 200,
    description: 'Agoda case item updated successfully',
    type: AgodaCaseItemResponseDto,
  })
  @ApiResponse({
    status: 404,
    description:
      'Agoda case item, property, batch, portfolio or user not found',
  })
  @ValidateBody(updateAgodaCaseItemSchema)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateAgodaCaseItemDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const item = await this.agodaCaseItemService.update(id, body);
        return {
          statusCode: 200,
          message: 'Agoda case item updated successfully',
          data: item,
        };
      },
      this.logger,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an agoda case item' })
  @ApiParam({ name: 'id', description: 'Agoda case item ID' })
  @ApiResponse({
    status: 200,
    description: 'Agoda case item deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Agoda case item not found' })
  async delete(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.agodaCaseItemService.delete(id);
        return {
          statusCode: 200,
          message: 'Agoda case item deleted successfully',
          data: result,
        };
      },
      this.logger,
    );
  }
}
