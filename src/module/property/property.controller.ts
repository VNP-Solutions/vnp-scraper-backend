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
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ParseQuery } from 'src/common/decorators/parse-query.decorator';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatePropertyDto, UpdatePropertyDto } from './property.dto';
import { IPropertyService } from './property.interface';
import { createPropertySchema } from './property.validation';

@ApiTags('Properties')
@ApiBearerAuth('JWT-auth')
@Controller('/properties')
export class PropertyController {
  constructor(
    @Inject('IPropertyService')
    private readonly propertyService: IPropertyService,
    private readonly logger: Logger,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create new property' })
  @ApiResponse({
    status: 201,
    description: 'Property created successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ValidateBody(createPropertySchema)
  @UseGuards(JwtAuthGuard)
  async createProperty(
    @Req() request: Request,
    @Body() createPropertyDto: CreatePropertyDto,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      return ResponseHandler.handler(
        response,
        async () => {
          return {
            statusCode: 403,
            message: 'You are not authorized to create a property',
            data: null,
          };
        },
        this.logger,
      );
    }
    return ResponseHandler.handler(
      response,
      async () => {
        const res =
          await this.propertyService.createProperty(createPropertyDto);
        return {
          statusCode: 201,
          message: 'Property created successfully',
          data: res,
        };
      },
      this.logger,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all properties' })
  @ApiResponse({
    status: 200,
    description: 'Returns list of properties',
  })
  @UseGuards(JwtAuthGuard)
  @ParseQuery()
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search properties by name',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: 'number',
    description: 'Page number for pagination',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: 'number',
    description: 'Number of items per page',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description: 'Field to sort by',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort order (asc or desc)',
  })
  @ApiQuery({
    name: 'start_date',
    required: false,
    description: 'Start date for filtering',
  })
  @ApiQuery({
    name: 'end_date',
    required: false,
    description: 'End date for filtering',
  })
  @ApiQuery({
    name: 'portfolio_id',
    required: false,
    description: 'Filter by portfolio ID',
  })
  @ApiQuery({
    name: 'sub_portfolio_id',
    required: false,
    description: 'Filter by sub-portfolio ID',
  })
  @ApiQuery({
    name: 'expedia_id',
    required: false,
    description: 'Filter by Expedia ID',
  })
  @ApiQuery({
    name: 'expedia_status',
    required: false,
    description: 'Filter by Expedia status',
  })
  @ApiQuery({
    name: 'booking_id',
    required: false,
    description: 'Filter by Booking ID',
  })
  @ApiQuery({
    name: 'booking_status',
    required: false,
    description: 'Filter by Booking status',
  })
  @ApiQuery({
    name: 'agoda_id',
    required: false,
    description: 'Filter by Agoda ID',
  })
  @ApiQuery({
    name: 'agoda_status',
    required: false,
    description: 'Filter by Agoda status',
  })
  async getAllProperties(@Req() request: Request, @Res() response: Response) {
    const { user } = request as any;
    const query = (request as any).query as Record<string, any>;
    let properties = null;
    if (user.role !== 'admin') {
      properties = await this.propertyService.getFilteredProperty(
        user.userId,
        query,
      );
    } else {
      properties = await this.propertyService.getAllProperties(query);
    }
    return ResponseHandler.handler(
      response,
      async () => {
        return {
          statusCode: 200,
          message: 'Properties retrieved successfully',
          data: properties,
        };
      },
      this.logger,
    );
  }

  @Get('/dropdown')
  @ApiOperation({ summary: 'Get portfolio and sub-portfolio for dropdown' })
  @ApiResponse({
    status: 200,
    description: 'Returns portfolio and sub-portfolio for dropdown',
  })
  @UseGuards(JwtAuthGuard)
  async getPortfolioAndSubPortfolioForDropdown(
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    const data =
      await this.propertyService.findPortfolioAndSubPortfolioForDropdown(user);
    return ResponseHandler.handler(
      response,
      async () => {
        return {
          statusCode: 200,
          message: 'Portfolio and sub-portfolio retrieved successfully',
          data: data,
        };
      },
      this.logger,
    );
  }

  @Get('/:id')
  @ApiOperation({ summary: 'Get property by ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns property',
  })
  @UseGuards(JwtAuthGuard)
  async getPropertyById(
    @Req() request: Request,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      const permissionData = await this.propertyService.getPermission(
        id,
        user.userId,
      );
      if (!permissionData) {
        return ResponseHandler.handler(
          response,
          async () => {
            return {
              statusCode: 403,
              message: 'You are not authorized to get this property',
              data: null,
            };
          },
          this.logger,
        );
      }
    }

    return ResponseHandler.handler(
      response,
      async () => {
        const property = await this.propertyService.getPropertyById(id);
        return {
          statusCode: 200,
          message: 'Property retrieved successfully',
          data: property,
        };
      },
      this.logger,
    );
  }

  @Put('/:id')
  @ApiOperation({ summary: 'Update property by ID' })
  @ApiResponse({
    status: 200,
    description: 'Property updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Property not found' })
  @UseGuards(JwtAuthGuard)
  async updateProperty(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() updatePropertyDto: UpdatePropertyDto,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      return ResponseHandler.handler(
        response,
        async () => {
          return {
            statusCode: 403,
            message: 'You are not authorized to update a property',
            data: null,
          };
        },
        this.logger,
      );
    }
    return ResponseHandler.handler(
      response,
      async () => {
        const property = await this.propertyService.updateProperty(
          id,
          updatePropertyDto,
        );
        return {
          statusCode: 200,
          message: 'Property updated successfully',
          data: property,
        };
      },
      this.logger,
    );
  }

  @Delete('/:id')
  @ApiOperation({ summary: 'Delete property by ID' })
  @ApiResponse({
    status: 200,
    description: 'Property deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Property not found' })
  @UseGuards(JwtAuthGuard)
  async deleteProperty(
    @Req() request: Request,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      return ResponseHandler.handler(
        response,
        async () => {
          return {
            statusCode: 403,
            message: 'You are not authorized to delete a property',
            data: null,
          };
        },
        this.logger,
      );
    }
    return ResponseHandler.handler(
      response,
      async () => {
        await this.propertyService.deleteProperty(id);
        return {
          statusCode: 200,
          message: 'Property deleted successfully',
          data: null,
        };
      },
      this.logger,
    );
  }

  @Get('/portfolio/:portfolioId')
  @ApiOperation({ summary: 'Get properties by portfolio ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns properties by portfolio ID',
  })
  @UseGuards(JwtAuthGuard)
  async getPropertiesByPortfolioId(
    @Req() request: Request,
    @Param('portfolioId') portfolioId: string,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    let properties = [];
    if (user.role !== 'admin') {
      const permissionData =
        await this.propertyService.getPermissionByPortfolioId(
          portfolioId,
          user.userId,
        );
      if (!permissionData) {
        return ResponseHandler.handler(
          response,
          async () => {
            return {
              statusCode: 403,
              message:
                'You are not authorized to get properties by portfolio ID',
              data: null,
            };
          },
          this.logger,
        );
      }
    }
    properties =
      await this.propertyService.getPropertyByPortfolioId(portfolioId);

    return ResponseHandler.handler(
      response,
      async () => {
        return {
          statusCode: 200,
          message: 'Properties retrieved successfully',
          data: properties,
        };
      },
      this.logger,
    );
  }

  @Get('/sub-portfolio/:subPortfolioId')
  @ApiOperation({ summary: 'Get properties by sub-portfolio ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns properties by sub-portfolio ID',
  })
  @UseGuards(JwtAuthGuard)
  async getPropertiesBySubPortfolioId(
    @Req() request: Request,
    @Param('subPortfolioId') subPortfolioId: string,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    let properties = [];
    if (user.role !== 'admin') {
      const permissionData =
        await this.propertyService.getPermissionBySubPortfolioId(
          subPortfolioId,
          user.userId,
        );
      if (!permissionData) {
        return ResponseHandler.handler(
          response,
          async () => {
            return {
              statusCode: 403,
              message:
                'You are not authorized to get properties by sub-portfolio ID',
              data: null,
            };
          },
          this.logger,
        );
      }
    }
    properties =
      await this.propertyService.getPropertyBySubPortfolioId(subPortfolioId);
    return ResponseHandler.handler(
      response,
      async () => {
        const properties =
          await this.propertyService.getPropertyBySubPortfolioId(
            subPortfolioId,
          );
        return {
          statusCode: 200,
          message: 'Properties retrieved successfully',
          data: properties,
        };
      },
      this.logger,
    );
  }

  @Get('/dropdown/properties')
  @ApiOperation({ summary: 'Get all properties based on user permissions' })
  @ApiResponse({
    status: 200,
    description: 'Returns all properties based on user permissions',
  })
  @UseGuards(JwtAuthGuard)
  async getAllPropertiesByPermission(
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    const isAdmin = user.role === 'admin';
    const properties =
      await this.propertyService.getAllPropertiesByUserPermission(
        user.userId,
        isAdmin,
      );
    return ResponseHandler.handler(
      response,
      async () => {
        return {
          statusCode: 200,
          message: 'Properties retrieved successfully',
          data: properties,
        };
      },
      this.logger,
    );
  }
}
