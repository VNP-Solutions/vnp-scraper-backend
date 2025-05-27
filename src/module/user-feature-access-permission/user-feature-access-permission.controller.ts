import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  Param,
  Patch,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { ValidateBody } from '../../common/decorators/validate.decorator';
import { UserFeatureAccessPermissionDto } from './user-feature-access-permission.dto';
import { IUserFeatureAccessPermissionService } from './user-feature-access-permission.interface';
import { createUserFeatureAccessPermissionSchema } from './user-feature-access-permission.validation';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('User Feature Access Permissions')
@ApiBearerAuth('JWT-auth')
@Controller('/user-feature-access-permissions')
export class UserFeatureAccessPermissionController {
  constructor(
    @Inject('IUserFeatureAccessPermissionService')
    private readonly userFeatureAccessPermissionService: IUserFeatureAccessPermissionService,
    private readonly logger: Logger,
  ) {}

  @Patch()
  @ApiOperation({ summary: 'Create a new user feature access permission' })
  @ApiResponse({ status: 201, description: 'Permission created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ValidateBody(createUserFeatureAccessPermissionSchema)
  @ApiBody({
    type: [UserFeatureAccessPermissionDto]
  })
  @UseGuards(JwtAuthGuard)
  async createOrUpdateUserFeatureAccessPermission(
    @Req() request: Request,
    @Body() data: UserFeatureAccessPermissionDto[],
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const { user } = request as any;
        if (user.role !== 'admin') {
          return {
            statusCode: 403,
            message: 'You need to be admin to set permission',
            data: null,
          };
        }
        const result =
          await this.userFeatureAccessPermissionService.createOrUpdateUserFeatureAccessPermission(
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
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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

  @Delete('/:id')
  @ApiOperation({ summary: 'Delete a user feature access permission' })
  @ApiResponse({ status: 200, description: 'Permission deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  async deleteUserFeatureAccessPermission(
    @Req() request: Request,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const { user } = request as any;
        if (user.role !== 'admin') {
          return {
            statusCode: 403,
            message: 'You need to be admin to change permission',
            data: null,
          };
        }
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