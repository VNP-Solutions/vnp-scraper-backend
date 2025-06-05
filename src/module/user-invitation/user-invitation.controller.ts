import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
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
import { Response } from 'express';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { ValidateBody } from '../../common/decorators/validate.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AcceptInvitationDto,
  CreateInvitationDto,
  ResendInvitationDto,
  UpdateInvitationDto,
} from './user-invitation.dto';
import { IUserInvitationService } from './user-invitation.interface';
import {
  acceptInvitationSchema,
  createInvitationSchema,
  resendInvitationSchema,
  updateInvitationSchema,
} from './user-invitation.validation';

@ApiTags('User Invitations')
@Controller('/invitations')
export class UserInvitationController {
  constructor(
    @Inject('IUserInvitationService')
    private readonly invitationService: IUserInvitationService,
    private readonly logger: Logger,
  ) {}

  @Post()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Create a new user invitation with permissions (Admin only)',
    description:
      'Create a user invitation. If role is "admin", permission arrays will be ignored as admins have full access. Permission arrays are only used for "partial" role users.',
  })
  @ApiResponse({ status: 201, description: 'Invitation created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({
    status: 409,
    description: 'User already exists or invitation pending',
  })
  @ValidateBody(createInvitationSchema)
  @ApiBody({
    type: CreateInvitationDto,
    examples: {
      admin_invitation: {
        summary: 'Admin invitation (permissions ignored)',
        value: {
          email: 'admin@example.com',
          role: 'admin',
          message: 'Welcome to the admin team!',
        },
      },
      partial_invitation_with_permissions: {
        summary: 'Partial user with specific portfolio/property access',
        value: {
          email: 'user@example.com',
          role: 'partial',
          message:
            'Welcome to VNP Solutions! You have been granted access to specific portfolios.',
          portfolio_ids: [
            '507f1f77bcf86cd799439011',
            '507f1f77bcf86cd799439012',
          ],
          sub_portfolio_ids: ['507f1f77bcf86cd799439013'],
          property_ids: [
            '507f1f77bcf86cd799439015',
            '507f1f77bcf86cd799439016',
          ],
        },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  async createInvitation(
    @Req() request: Request,
    @Body() data: CreateInvitationDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const { user } = request as any;
        if (user.role !== 'admin') {
          return {
            statusCode: 403,
            message: 'Admin access required to create invitations',
            data: null,
          };
        }

        const invitation = await this.invitationService.createInvitation(
          user.userId,
          data,
        );
        return {
          statusCode: 201,
          message: 'Invitation created and sent successfully',
          data: invitation,
        };
      },
      this.logger,
    );
  }

  @Get()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get all invitations with pagination and filtering (Admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Invitations retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['Pending', 'Accepted', 'Expired', 'Cancelled'],
    description: 'Filter by status',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: ['admin', 'partial'],
    description: 'Filter by role',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by email or inviter name',
  })
  @UseGuards(JwtAuthGuard)
  async getAllInvitations(
    @Req() request: Request,
    @Query() query: Record<string, any>,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const { user } = request as any;
        if (user.role !== 'admin') {
          return {
            statusCode: 403,
            message: 'Admin access required to view invitations',
            data: null,
          };
        }

        const result = await this.invitationService.getAllInvitations(query);
        return {
          statusCode: 200,
          message: 'Invitations retrieved successfully',
          data: result.data,
          metadata: result.metadata,
        };
      },
      this.logger,
    );
  }

  @Get('/:id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get invitation by ID (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Invitation retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  @ApiParam({ name: 'id', description: 'Invitation ID' })
  @UseGuards(JwtAuthGuard)
  async getInvitationById(
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
            message: 'Admin access required to view invitation details',
            data: null,
          };
        }

        const invitation = await this.invitationService.getInvitationById(id);
        return {
          statusCode: 200,
          message: 'Invitation retrieved successfully',
          data: invitation,
        };
      },
      this.logger,
    );
  }

  @Get('/token/:token')
  @ApiOperation({
    summary:
      'Get invitation by token (Public endpoint for invitation acceptance)',
  })
  @ApiResponse({
    status: 200,
    description: 'Invitation retrieved successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired invitation' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  @ApiParam({ name: 'token', description: 'Invitation token' })
  async getInvitationByToken(
    @Param('token') token: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const invitation =
          await this.invitationService.getInvitationByToken(token);
        return {
          statusCode: 200,
          message: 'Invitation retrieved successfully',
          data: {
            id: invitation.id,
            email: invitation.email,
            role: invitation.role,
            message: invitation.message,
            invitedBy: (invitation as any).invitedBy?.name || 'Admin',
            createdAt: invitation.createdAt,
            expires_at: invitation.expires_at,
          },
        };
      },
      this.logger,
    );
  }

  @Post('/accept/:token')
  @ApiOperation({ summary: 'Accept an invitation and create user account' })
  @ApiResponse({
    status: 201,
    description: 'Invitation accepted and user created successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired invitation' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  @ValidateBody(acceptInvitationSchema)
  @ApiBody({ type: AcceptInvitationDto })
  @ApiParam({ name: 'token', description: 'Invitation token' })
  async acceptInvitation(
    @Param('token') token: string,
    @Body() data: AcceptInvitationDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.invitationService.acceptInvitation(
          token,
          data,
        );
        return {
          statusCode: 201,
          message: 'Invitation accepted successfully. User account created.',
          data: result,
        };
      },
      this.logger,
    );
  }

  @Patch('/:id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update invitation (Admin only)' })
  @ApiResponse({ status: 200, description: 'Invitation updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  @ValidateBody(updateInvitationSchema)
  @ApiBody({ type: UpdateInvitationDto })
  @ApiParam({ name: 'id', description: 'Invitation ID' })
  @UseGuards(JwtAuthGuard)
  async updateInvitation(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() data: UpdateInvitationDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const { user } = request as any;
        if (user.role !== 'admin') {
          return {
            statusCode: 403,
            message: 'Admin access required to update invitations',
            data: null,
          };
        }

        const invitation = await this.invitationService.updateInvitation(
          id,
          data,
        );
        return {
          statusCode: 200,
          message: 'Invitation updated successfully',
          data: invitation,
        };
      },
      this.logger,
    );
  }

  @Post('/:id/resend')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Resend invitation email (Admin only)' })
  @ApiResponse({ status: 200, description: 'Invitation resent successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  @ApiResponse({
    status: 400,
    description: 'Cannot resend non-pending invitation',
  })
  @ValidateBody(resendInvitationSchema)
  @ApiBody({ type: ResendInvitationDto })
  @ApiParam({ name: 'id', description: 'Invitation ID' })
  @UseGuards(JwtAuthGuard)
  async resendInvitation(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() data: ResendInvitationDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const { user } = request as any;
        if (user.role !== 'admin') {
          return {
            statusCode: 403,
            message: 'Admin access required to resend invitations',
            data: null,
          };
        }

        const invitation = await this.invitationService.resendInvitation(
          id,
          data.message,
        );
        return {
          statusCode: 200,
          message: 'Invitation resent successfully',
          data: invitation,
        };
      },
      this.logger,
    );
  }

  @Post('/:id/cancel')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Cancel pending invitation (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Invitation cancelled successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  @ApiResponse({
    status: 400,
    description: 'Cannot cancel non-pending invitation',
  })
  @ApiParam({ name: 'id', description: 'Invitation ID' })
  @UseGuards(JwtAuthGuard)
  async cancelInvitation(
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
            message: 'Admin access required to cancel invitations',
            data: null,
          };
        }

        const invitation = await this.invitationService.cancelInvitation(id);
        return {
          statusCode: 200,
          message: 'Invitation cancelled successfully',
          data: invitation,
        };
      },
      this.logger,
    );
  }

  @Delete('/:id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete invitation (Admin only)' })
  @ApiResponse({ status: 200, description: 'Invitation deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  @ApiParam({ name: 'id', description: 'Invitation ID' })
  @UseGuards(JwtAuthGuard)
  async deleteInvitation(
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
            message: 'Admin access required to delete invitations',
            data: null,
          };
        }

        const invitation = await this.invitationService.deleteInvitation(id);
        return {
          statusCode: 200,
          message: 'Invitation deleted successfully',
          data: invitation,
        };
      },
      this.logger,
    );
  }
}
