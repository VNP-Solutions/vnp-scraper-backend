import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { LoginDto, RegisterDto } from './auth.dto';
import { AuthService } from './auth.service';
import {
  ForgotPasswordSchema,
  LoginSchema,
  RegisterSchema,
  ResetPasswordSchema,
  ValidateResetOtpSchema,
  VerifyOtpSchema,
} from './auth.validation';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  ValidateResetOtpDto,
} from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user information' })
  @ApiResponse({ status: 200, description: 'Returns current user info' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCurrentUser(@Request() req) {
    return {
      userId: req.user.userId,
      email: req.user.email,
      role: req.user.role,
    };
  }

  @Post('/login')
  @ValidateBody(LoginSchema)
  @ApiOperation({ summary: 'Request OTP for login' })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto) {
    await this.authService.validateUser(loginDto.email, loginDto.password);
    return {
      message: 'OTP has been sent to your email',
      email: loginDto.email,
    };
  }

  @Post('/verify-otp')
  @ValidateBody(VerifyOtpSchema)
  @ApiOperation({ summary: 'Verify OTP and get JWT token' })
  @ApiResponse({ status: 202, description: 'OTP verified successfully' })
  @ApiResponse({ status: 401, description: 'Invalid OTP' })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOTP(verifyOtpDto);
  }

  @Post('/register')
  @ValidateBody(RegisterSchema)
  @ApiOperation({ summary: 'Register new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('/forgot-password')
  @ValidateBody(ForgotPasswordSchema)
  @ApiOperation({ summary: 'Request password reset OTP' })
  @ApiResponse({
    status: 200,
    description: 'Password reset OTP sent successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('/validate-reset-otp')
  @ValidateBody(ValidateResetOtpSchema)
  @ApiOperation({ summary: 'Validate OTP for password reset' })
  @ApiResponse({
    status: 200,
    description: 'OTP validated successfully, reset token provided',
  })
  @ApiResponse({ status: 401, description: 'Invalid OTP or user not found' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async validateResetOtp(@Body() validateResetOtpDto: ValidateResetOtpDto) {
    return this.authService.validateResetOtp(validateResetOtpDto);
  }

  @Post('/reset-password')
  @ValidateBody(ResetPasswordSchema)
  @ApiOperation({ summary: 'Reset password using reset token' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired reset token' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }
}
