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
import {
  CreatePropertyCredentialsDto,
  UpdatePropertyCredentialsDto,
} from './property-credentials.dto';
import { IPropertyCredentialsService } from './property-credentials.interface';
import { createPropertyCredentialsSchema } from './property-credentials.validation';

@ApiTags('Property Credentials')
@ApiBearerAuth('JWT-auth')
@Controller('/property-credentials')
export class PropertyCredentialsController {
  constructor(
    @Inject('IPropertyCredentialsService')
    private readonly propertyCredentialsService: IPropertyCredentialsService,
    private readonly logger: Logger,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create new property credentials' })
  @ApiResponse({
    status: 201,
    description: 'Property credentials created successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ValidateBody(createPropertyCredentialsSchema)
  async createPropertyCredentials(
    @Body() createPropertyCredentialsDto: CreatePropertyCredentialsDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const res =
          await this.propertyCredentialsService.createPropertyCredentials(
            createPropertyCredentialsDto,
          );
        return {
          statusCode: 201,
          message: 'Property credentials created successfully',
          data: res,
        };
      },
      this.logger,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all property credentials' })
  @ApiResponse({
    status: 200,
    description: 'Returns list of property credentials',
  })
  async getAllPropertyCredentials(@Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const credentials =
          await this.propertyCredentialsService.getAllPropertyCredentials();
        return {
          statusCode: 200,
          message: 'Property credentials retrieved successfully',
          data: credentials,
        };
      },
      this.logger,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get property credentials by ID' })
  @ApiResponse({ status: 200, description: 'Returns property credentials' })
  @ApiResponse({ status: 404, description: 'Property credentials not found' })
  async getPropertyCredentialsById(
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const credentials =
          await this.propertyCredentialsService.getPropertyCredentialsById(id);
        return {
          statusCode: 200,
          message: 'Property credentials retrieved successfully',
          data: credentials,
        };
      },
      this.logger,
    );
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update property credentials by ID' })
  @ApiResponse({
    status: 200,
    description: 'Property credentials updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Property credentials not found' })
  async updatePropertyCredentials(
    @Param('id') id: string,
    @Body() updatePropertyCredentialsDto: UpdatePropertyCredentialsDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const credentials =
          await this.propertyCredentialsService.updatePropertyCredentials(
            id,
            updatePropertyCredentialsDto,
          );
        return {
          statusCode: 200,
          message: 'Property credentials updated successfully',
          data: credentials,
        };
      },
      this.logger,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete property credentials by ID' })
  @ApiResponse({
    status: 200,
    description: 'Property credentials deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Property credentials not found' })
  async deletePropertyCredentials(
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        await this.propertyCredentialsService.deletePropertyCredentials(id);
        return {
          statusCode: 200,
          message: 'Property credentials deleted successfully',
          data: null,
        };
      },
      this.logger,
    );
  }
}
