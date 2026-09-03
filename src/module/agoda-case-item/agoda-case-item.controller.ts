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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ParseQuery } from 'src/common/decorators/parse-query.decorator';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AgodaCaseItemListResponseDto,
  AgodaCaseItemResponseDto,
  CreateAgodaCaseItemDto,
  UpdateAgodaCaseItemDto,
} from './agoda-case-item.dto';
import {
  AgodaCaseItemFilters,
  IAgodaCaseItemService,
} from './agoda-case-item.interface';
import {
  createAgodaCaseItemSchema,
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

  @Get()
  @ApiOperation({
    summary: 'Get all agoda case items with pagination and search',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by ID, reservation_id, guest_name or vcc_card_number',
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
        const filters: AgodaCaseItemFilters = {};
        const {
          search,
          property_id,
          batch_id,
          portfolio_id,
          retrival_status,
          charge_status,
          is_missing,
          page,
          limit,
          order,
        } = query;

        if (search) filters.search = search;
        if (property_id) filters.property_id = property_id;
        if (batch_id) filters.batch_id = batch_id;
        if (portfolio_id) filters.portfolio_id = portfolio_id;
        if (retrival_status) filters.retrival_status = retrival_status;
        if (charge_status) filters.charge_status = charge_status;
        if (is_missing !== undefined)
          filters.is_missing = is_missing === true || is_missing === 'true';
        if (page) filters.page = page;
        if (limit) filters.limit = limit;
        if (order) filters.order = order;

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
