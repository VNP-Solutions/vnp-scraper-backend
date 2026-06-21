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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ParseQuery } from 'src/common/decorators/parse-query.decorator';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { ExcelFileInterceptor } from 'src/common/interceptors';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreatePropertyDto,
  ImportExpediaCredentialsResponseDto,
  ImportPropertiesResponseDto,
  RevealOtaCredentialsDto,
  RevealOtaCredentialsResponseDto,
  SyncDeleteDto,
  UpdateOtaCredentialsDto,
  UpdateOtaCredentialsResponseDto,
  UpdatePropertyDto,
} from './property.dto';
import { IPropertyService } from './property.interface';
import {
  createPropertySchema,
  revealOtaCredentialsSchema,
  type RevealOtaCredentialsBody,
  updateOtaCredentialsSchema,
  type UpdateOtaCredentialsBody,
} from './property.validation';
import { ServiceTokenGuard } from './guards/service-token';

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
  async getAllProperties(
    @Req() request: Request,
    @ParseQuery() query: Record<string, any>,
    @Res() response: Response,
  ) {
    const { user } = request as any;
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

  @Post('/import')
  @ApiOperation({
    summary: 'Import properties from Excel file',
    description:
      'Upload an Excel file to import properties, portfolios, and sub-portfolios. Columns: Portfolio (optional), Sub Portfolio (optional), Property Name (required), optional Phone Number and optional Slot — with both, links to the phone pool by last 3 digits + slot or creates a pool row; with phone only, finds an existing PhoneNumberSlot by last 3 digits (exact full-number match preferred). Sets property phone_number, slot, and phone_number_slot_id. Credential columns: Expedia/Agoda/Booking usernames and passwords, Expedia Email Associated, Property/Portfolio contact emails, Multiple Portfolio Emails.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Excel file for property import',
    type: 'multipart/form-data',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description:
            'Excel file (.xlsx, .xls, .csv) containing property data',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Properties imported successfully',
    type: ImportPropertiesResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid file or missing required columns',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(ExcelFileInterceptor)
  async importProperties(
    @Req() request: Request,
    @UploadedFile() file: Express.Multer.File,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      return ResponseHandler.handler(
        response,
        async () => {
          return {
            statusCode: 403,
            message: 'You are not authorized to import properties',
            data: null,
          };
        },
        this.logger,
      );
    }

    if (!file) {
      return ResponseHandler.handler(
        response,
        async () => {
          return {
            statusCode: 400,
            message: 'Excel file is required',
            data: null,
          };
        },
        this.logger,
      );
    }

    return ResponseHandler.handler(
      response,
      async () => {
        const result =
          await this.propertyService.importPropertiesFromExcel(file);
        return {
          statusCode: 200,
          message: `Import completed successfully: ${result.portfoliosCreated} portfolios, ${result.subPortfoliosCreated} sub-portfolios, ${result.propertiesCreated} properties, and ${result.credentialsCreated} credentials created`,
          data: result,
        };
      },
      this.logger,
    );
  }

  @Post('/import-bulk-credentials')
  @ApiOperation({
    summary: 'Bulk update Expedia credentials from Excel',
    description:
      'Upload a spreadsheet with columns: Expedia ID, Expedia Username, Expedia Password. Each row finds every property with that expedia_id and updates (or creates) property_credentials expediaUsername and expediaPassword for each. Header names are matched case-insensitively.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Excel file with Expedia ID, Username, Password columns',
    type: 'multipart/form-data',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Excel file (.xlsx, .xls, .csv)',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Import finished; see counts and per-row failures in data',
    type: ImportExpediaCredentialsResponseDto,
  })
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(ExcelFileInterceptor)
  async importExpediaCredentials(
    @Req() request: Request,
    @UploadedFile() file: Express.Multer.File,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      return ResponseHandler.handler(
        response,
        async () => {
          return {
            statusCode: 403,
            message: 'You are not authorized to import Expedia credentials',
            data: null,
          };
        },
        this.logger,
      );
    }

    if (!file) {
      return ResponseHandler.handler(
        response,
        async () => {
          return {
            statusCode: 400,
            message: 'Excel file is required',
            data: null,
          };
        },
        this.logger,
      );
    }

    return ResponseHandler.handler(
      response,
      async () => {
        const result =
          await this.propertyService.importExpediaCredentialsFromExcel(file);
        return {
          statusCode: 200,
          message: `Expedia credentials import completed: ${result.updated} updated, ${result.propertyNotFound} property not found, ${result.rowsSkippedInvalid} rows skipped`,
          data: result,
        };
      },
      this.logger,
    );
  }

  @Post('/ota-credentials/reveal')
  @UseGuards(JwtAuthGuard)
  @ValidateBody(revealOtaCredentialsSchema)
  @ApiOperation({
    summary: 'Read decrypted OTA username and password for a property',
    description:
      'Returns plaintext username and decrypted password for the given `property_id` and `ota_provider`. Sensitive: use only for trusted operators over HTTPS.',
  })
  @ApiBody({ type: RevealOtaCredentialsDto })
  @ApiResponse({
    status: 200,
    description:
      'Check propertyNotFound / credentialsNotFound; username and password may be empty',
    type: RevealOtaCredentialsResponseDto,
  })
  async revealOtaCredentials(
    @Body() body: RevealOtaCredentialsBody,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const data = await this.propertyService.getOtaCredentialsReveal(body);
        let message = 'Credentials retrieved';
        if (data.propertyNotFound) {
          message = 'No property found with this property_id';
        } else if (data.credentialsNotFound) {
          message = 'No property_credentials row for this property';
        }
        return {
          statusCode: 200,
          message,
          data,
        };
      },
      this.logger,
    );
  }

  @Post('/ota-credentials')
  @UseGuards(JwtAuthGuard)
  @ValidateBody(updateOtaCredentialsSchema)
  @ApiOperation({
    summary: 'Update property credentials by property id and OTA',
    description:
      '`property_id` (Mongo ObjectId), `ota_provider` (Expedia, Agoda, or Booking), plus `username` and/or `password`. Updates that OTA’s fields on property_credentials for that property only.',
  })
  @ApiBody({ type: UpdateOtaCredentialsDto })
  @ApiResponse({
    status: 200,
    description: 'Update finished; see updated count and failures in data',
    type: UpdateOtaCredentialsResponseDto,
  })
  async updateOtaCredentials(
    @Body() body: UpdateOtaCredentialsBody,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.propertyService.updateOtaCredentials(body);
        return {
          statusCode: 200,
          message: result.propertyNotFound
            ? 'No property found with this property_id'
            : result.updated > 0
              ? 'Credentials updated successfully'
              : 'Credentials were not updated; see failures in data',
          data: result,
        };
      },
      this.logger,
    );
  }
  @Post('/sync-create')
  @UseGuards(ServiceTokenGuard)
  @ApiOperation({ summary: 'Internal: create property synced from DBMS' })
  async syncCreate(@Body() dto: CreatePropertyDto, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => ({
        statusCode: 201,
        message: 'Sync create processed',
        data: await this.propertyService.syncCreate(dto),
      }),
      this.logger,
    )
  }
  @Post('/sync-delete')
  @UseGuards(ServiceTokenGuard)
  @ApiOperation({ summary: 'Internal: delete property synced from DBMS' })
  async syncDelete(@Body() dto: SyncDeleteDto, @Res() response: Response) {
  return ResponseHandler.handler(
  response,
  async () => ({
    statusCode: 200,
    message: 'Sync delete processed',
    data: await this.propertyService.syncDelete(dto),
  }),
  this.logger,
  )
  }
}
