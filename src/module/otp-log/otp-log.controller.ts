import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ParseQuery } from 'src/common/decorators/parse-query.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IOtpLogService } from './otp-log.interface';

@ApiTags('OTP Logs')
@ApiBearerAuth('JWT-auth')
@Controller('/otp-logs')
@UseGuards(JwtAuthGuard)
export class OtpLogController {
  constructor(
    @Inject('IOtpLogService')
    private readonly otpLogService: IOtpLogService,
  ) {}

  private checkAdminRole(req: any) {
    const user = req.user;
    if (!user || user.role !== 'admin') {
      throw new ForbiddenException('Only admin users can access OTP logs');
    }
  }

  @Get()
  @ApiOperation({
    summary: 'Get all OTP logs with pagination and filtering',
  })
  @ApiResponse({ status: 200, description: 'Returns paginated OTP logs' })
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
    name: 'search',
    required: false,
    description: 'Search by user name, email, or OTP code',
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
    name: 'is_used',
    required: false,
    type: 'boolean',
    description: 'Filter by OTP usage status',
  })
  @ApiQuery({
    name: 'user_id',
    required: false,
    description: 'Filter by specific user ID',
  })
  @ApiQuery({
    name: 'purpose',
    required: false,
    enum: ['LOGIN', 'PASSWORD_RESET', 'ACCOUNT_VERIFICATION', 'MFA_SETUP'],
    description: 'Filter by OTP purpose',
  })
  @ApiQuery({
    name: 'ip_address',
    required: false,
    description: 'Filter by IP address',
  })
  async getAllOtps(@Request() req, @ParseQuery() query: Record<string, any>) {
    this.checkAdminRole(req);
    const { page = 1, limit = 10, ...otherQuery } = query;
    return this.otpLogService.getAllOtps(page, limit, otherQuery);
  }

  @Delete('/:id')
  @ApiOperation({ summary: 'Delete a specific OTP log' })
  @ApiResponse({
    status: 200,
    description: 'OTP log deleted successfully',
  })
  async deleteOtp(@Request() req, @Param('id') id: string) {
    this.checkAdminRole(req);
    return this.otpLogService.deleteOtp(id);
  }
}
