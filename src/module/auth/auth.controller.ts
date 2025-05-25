import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { LoginSchema, RegisterSchema, VerifyOtpSchema } from './auth.validation';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user information' })
  @ApiResponse({ status: 200, description: 'Returns current user info' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCurrentUser(@Request() req) {
    return {
      userId: req.user.userId,
      email: req.user.email,
      role: req.user.role
    };
  }

  @Post('login')
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

  @Post('verify-otp')
  @ValidateBody(VerifyOtpSchema)
  @ApiOperation({ summary: 'Verify OTP and get JWT token' })
  @ApiResponse({ status: 202, description: 'OTP verified successfully' })
  @ApiResponse({ status: 401, description: 'Invalid OTP' })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOTP(verifyOtpDto);
  }

  @Post('register')
  @ValidateBody(RegisterSchema)
  @ApiOperation({ summary: 'Register new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }
}