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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
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
  @UseGuards(JwtAuthGuard)
  async getAllProperties(@Req() request: Request, @Res() response: Response) {
    const { user } = request as any;
    let properties = [];
    if (user.role !== 'admin') {
      properties = await this.propertyService.getFilteredProperty(user.userId);
    } else {
      properties = await this.propertyService.getAllProperties();
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
}
