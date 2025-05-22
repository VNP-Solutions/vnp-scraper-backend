import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Inject,
  Res,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { IUserFeatureAccessPermissionService } from './user-feature-access-permission.interface';
import {
  CreateUserFeatureAccessPermissionDto,
  UpdateUserFeatureAccessPermissionDto,
} from './user-feature-access-permission.dto';
import { ValidateBody } from '../../common/decorators/validate.decorator';
import {
  createUserFeatureAccessPermissionSchema,
  updateUserFeatureAccessPermissionSchema,
} from './user-feature-access-permission.validation';
import { ResponseHandler } from 'src/common/utils/response-handler';

@ApiTags('User Feature Access Permissions')
@Controller('/user-feature-access-permissions')
export class UserFeatureAccessPermissionController {
  constructor(
    @Inject('IUserFeatureAccessPermissionService')
    private readonly userFeatureAccessPermissionService: IUserFeatureAccessPermissionService,
    private readonly logger: Logger,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new user feature access permission' })
  @ApiResponse({ status: 201, description: 'Permission created successfully' })
  @ValidateBody(createUserFeatureAccessPermissionSchema)
  async createUserFeatureAccessPermission(
    @Body() data: CreateUserFeatureAccessPermissionDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result =
          await this.userFeatureAccessPermissionService.createUserFeatureAccessPermission(
            data,
          );
        return {
          statusCode: 201,
          message: 'Permission created successfully',
          data: result,
        };
      },
      this.logger,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all user feature access permissions' })
  @ApiResponse({ status: 200, description: 'Returns all permissions' })
  async getAllUserFeatureAccessPermissions(@Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const permissions =
          await this.userFeatureAccessPermissionService.getAllUserFeatureAccessPermissions();
        return {
          statusCode: 200,
          message: 'Permissions retrieved successfully',
          data: permissions,
        };
      },
      this.logger,
    );
  }

  @Get('/:id')
  @ApiOperation({ summary: 'Get a user feature access permission by ID' })
  @ApiResponse({ status: 200, description: 'Returns the permission' })
  async getUserFeatureAccessPermissionById(
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const permission =
          await this.userFeatureAccessPermissionService.getUserFeatureAccessPermissionById(
            id,
          );
        return {
          statusCode: 200,
          message: 'Permission retrieved successfully',
          data: permission,
        };
      },
      this.logger,
    );
  }

  @Put('/:id')
  @ApiOperation({ summary: 'Update a user feature access permission' })
  @ApiResponse({ status: 200, description: 'Permission updated successfully' })
  @ValidateBody(updateUserFeatureAccessPermissionSchema)
  async updateUserFeatureAccessPermission(
    @Param('id') id: string,
    @Body() data: UpdateUserFeatureAccessPermissionDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const permission =
          await this.userFeatureAccessPermissionService.updateUserFeatureAccessPermission(
            id,
            data,
          );
        return {
          statusCode: 200,
          message: 'Permission updated successfully',
          data: permission,
        };
      },
      this.logger,
    );
  }

  @Delete('/:id')
  @ApiOperation({ summary: 'Delete a user feature access permission' })
  @ApiResponse({ status: 200, description: 'Permission deleted successfully' })
  async deleteUserFeatureAccessPermission(
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const permission =
          await this.userFeatureAccessPermissionService.deleteUserFeatureAccessPermission(
            id,
          );
        return {
          statusCode: 200,
          message: 'Permission deleted successfully',
          data: permission,
        };
      },
      this.logger,
    );
  }
}
