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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { ResponseHandler } from 'src/common/utils/response-handler';
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
  async createProperty(
    @Body() createPropertyDto: CreatePropertyDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const res =
          await this.propertyService.createProperty(createPropertyDto);
        return {
          statusCode: 200,
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
  async getAllProperties(@Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const properties = await this.propertyService.getAllProperties();
        return {
          statusCode: 200,
          message: 'Properties retrieved successfully',
          data: properties,
        };
      },
      this.logger,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get property by ID' })
  @ApiResponse({ status: 200, description: 'Returns property' })
  @ApiResponse({ status: 404, description: 'Property not found' })
  async getPropertyById(@Param('id') id: string, @Res() response: Response) {
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

  @Put(':id')
  @ApiOperation({ summary: 'Update property by ID' })
  @ApiResponse({
    status: 200,
    description: 'Property updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Property not found' })
  async updateProperty(
    @Param('id') id: string,
    @Body() updatePropertyDto: UpdatePropertyDto,
    @Res() response: Response,
  ) {
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

  @Delete(':id')
  @ApiOperation({ summary: 'Delete property by ID' })
  @ApiResponse({
    status: 200,
    description: 'Property deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Property not found' })
  async deleteProperty(@Param('id') id: string, @Res() response: Response) {
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
}
