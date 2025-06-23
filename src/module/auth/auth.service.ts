import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OtpPurpose, RoleEnum } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import { LoginDto, RegisterDto } from './auth.dto';
import { AuthRepository } from './auth.repository';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  ValidateResetOtpDto,
} from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
const crypto = require('crypto');

@Injectable()
export class AuthService {
  private transporter: nodemailer.Transporter;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      service: 'gmail',
      auth: {
        user: this.configService.get('SMTP_EMAIL'),
        pass: this.configService.get('SMTP_PASSWORD'),
      },
      tls: {
        rejectUnauthorized: true,
      },
    });
  }

  private generateOTP(): string {
    return crypto.randomInt(100000, 999999).toString().padStart(6, '0');
  }

  private async sendOTPEmail(email: string, otp: string): Promise<void> {
    const emailHTML = `<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f4; color: #333333; line-height: 1.6;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <tr>
            <td style="padding: 30px 20px; text-align: center; background-color: #ffffff; border-bottom: 1px solid #eeeeee;">
                <!-- Logo Placeholder -->
                <img src="https://argobot-bucket.s3.us-east-2.amazonaws.com/VNP+LOGO_PNG.png" alt="VNP Solutions Logo" style="max-width: 200px; height: auto;">
            </td>
        </tr>
        <tr>
            <td style="padding: 30px 30px 20px 30px;">
                <h1 style="margin: 0 0 20px 0; font-size: 24px; line-height: 32px; font-weight: 700; color: #333333;">Verify Your Login</h1>
                <p style="margin: 0 0 20px 0; font-size: 16px;">Hello,</p>
                <p style="margin: 0 0 20px 0; font-size: 16px;">We've received a login attempt for your VNP Solutions account. To ensure your account security, please use the verification code below to complete the login process.</p>
                
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0; background-color: #f8f9fa; border-radius: 6px; padding: 20px;">
                    <tr>
                        <td style="text-align: center;">
                            <p style="margin: 0 0 15px 0; font-size: 16px; font-weight: 500;">Your verification code is:</p>
                            <p style="margin: 0; font-family: monospace; font-size: 32px; font-weight: 700; letter-spacing: 5px; color: #0066cc; background-color: #e8f0fe; padding: 15px; border-radius: 6px; display: inline-block;">${otp}</p>
                            <p style="margin: 15px 0 0 0; font-size: 14px; color: #666666;">This code will expire in 10 minutes</p>
                        </td>
                    </tr>
                </table>
                
                <p style="margin: 0 0 20px 0; font-size: 16px;">If you didn't attempt to log in, please contact our support team immediately or change your password to secure your account.</p>
                
                <h2 style="margin: 30px 0 15px 0; font-size: 20px; line-height: 28px; font-weight: 600; color: #333333;">Security Tips</h2>
                <ul style="margin: 0 0 20px 0; padding-left: 20px; font-size: 16px;">
                    <li style="margin-bottom: 8px;">Never share your verification code with anyone</li>
                    <li style="margin-bottom: 8px;">Ensure you're on the official VNP Solutions website or VNP Dashboard site before entering your code</li>
                    <li style="margin-bottom: 0;">Consider enabling two-factor authentication for added security</li>
                </ul>
                
                <p style="margin: 30px 0 15px 0; font-size: 16px;">Thank you for helping us keep your account secure.</p>
                
                <p style="margin: 0 0 10px 0; font-size: 16px;">Best regards,<br>VNP Solutions Security Team</p>
            </td>
        </tr>
        <tr>
            <td style="padding: 0;">
                <!-- Promotional Image -->
                <img src="https://argobot-bucket.s3.us-east-2.amazonaws.com/vnp-stock.jpeg" alt="Secure with VNP Solutions" style="width: 100%; height: auto; display: block;">
            </td>
        </tr>
        <tr>
            <td style="padding: 20px; text-align: center; background-color: #f8f9fa; font-size: 14px; color: #666666;">
                <p style="margin: 0 0 10px 0;">©️ 2025 VNP Solutions. All rights reserved.</p>
            </td>
        </tr>
    </table>
</body>`;
    const mailOptions = {
      from: 'VNP Team team@vnp.app',
      to: email,
      subject: 'Verify your login to the VNP Dashboard',
      text: `Your OTP for login is: ${otp}.`,
      html: emailHTML,
    };

    await this.transporter.sendMail(mailOptions);
  }

  private async sendPasswordResetEmail(
    email: string,
    otp: string,
  ): Promise<void> {
    const emailHTML = `<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f4; color: #333333; line-height: 1.6;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <tr>
            <td style="padding: 30px 20px; text-align: center; background-color: #ffffff; border-bottom: 1px solid #eeeeee;">
                <!-- Logo Placeholder -->
                <img src="https://argobot-bucket.s3.us-east-2.amazonaws.com/VNP+LOGO_PNG.png" alt="VNP Solutions Logo" style="max-width: 200px; height: auto;">
            </td>
        </tr>
        <tr>
            <td style="padding: 30px 30px 20px 30px;">
                <h1 style="margin: 0 0 20px 0; font-size: 24px; line-height: 32px; font-weight: 700; color: #333333;">Reset Your Password</h1>
                <p style="margin: 0 0 20px 0; font-size: 16px;">Hello,</p>
                <p style="margin: 0 0 20px 0; font-size: 16px;">We've received a request to reset your password for your VNP Solutions account. To proceed with the password reset, please use the verification code below.</p>
                
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0; background-color: #f8f9fa; border-radius: 6px; padding: 20px;">
                    <tr>
                        <td style="text-align: center;">
                            <p style="margin: 0 0 15px 0; font-size: 16px; font-weight: 500;">Your password reset code is:</p>
                            <p style="margin: 0; font-family: monospace; font-size: 32px; font-weight: 700; letter-spacing: 5px; color: #dc3545; background-color: #f8d7da; padding: 15px; border-radius: 6px; display: inline-block;">${otp}</p>
                            <p style="margin: 15px 0 0 0; font-size: 14px; color: #666666;">This code will expire in 5 minutes</p>
                        </td>
                    </tr>
                </table>
                
                <p style="margin: 0 0 20px 0; font-size: 16px;">If you didn't request a password reset, please ignore this email or contact our support team if you have concerns about your account security.</p>
                
                <h2 style="margin: 30px 0 15px 0; font-size: 20px; line-height: 28px; font-weight: 600; color: #333333;">Security Tips</h2>
                <ul style="margin: 0 0 20px 0; padding-left: 20px; font-size: 16px;">
                    <li style="margin-bottom: 8px;">Never share your verification code with anyone</li>
                    <li style="margin-bottom: 8px;">Use a strong, unique password for your account</li>
                    <li style="margin-bottom: 0;">Consider enabling two-factor authentication for added security</li>
                </ul>
                
                <p style="margin: 30px 0 15px 0; font-size: 16px;">Thank you for helping us keep your account secure.</p>
                
                <p style="margin: 0 0 10px 0; font-size: 16px;">Best regards,<br>VNP Solutions Security Team</p>
            </td>
        </tr>
        <tr>
            <td style="padding: 0;">
                <!-- Promotional Image -->
                <img src="https://argobot-bucket.s3.us-east-2.amazonaws.com/vnp-stock.jpeg" alt="Secure with VNP Solutions" style="width: 100%; height: auto; display: block;">
            </td>
        </tr>
        <tr>
            <td style="padding: 20px; text-align: center; background-color: #f8f9fa; font-size: 14px; color: #666666;">
                <p style="margin: 0 0 10px 0;">©️ 2025 VNP Solutions. All rights reserved.</p>
            </td>
        </tr>
    </table>
</body>`;
    const mailOptions = {
      from: 'VNP Team team@vnp.app',
      to: email,
      subject: 'Reset your VNP Dashboard password',
      text: `Your password reset code is: ${otp}.`,
      html: emailHTML,
    };

    await this.transporter.sendMail(mailOptions);
  }

  async validateUser(
    email: string,
    password: string,
    ipAddress?: string,
  ): Promise<any> {
    const user = await this.authRepository.findUserByEmail(email.toLowerCase());
    if (user && (await bcrypt.compare(password, user.password))) {
      const otp = this.generateOTP();

      await this.authRepository.createOTP(
        user.id,
        otp,
        OtpPurpose.LOGIN,
        ipAddress,
      );
      await this.sendOTPEmail(email, otp);

      return { email: user.email };
    }
    throw new UnauthorizedException('Invalid credentials');
  }

  async verifyOTP(verifyOtpDto: VerifyOtpDto) {
    const user = await this.authRepository.findUserByEmail(
      verifyOtpDto.email.toLowerCase(),
    );

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const otpRecord = await this.authRepository.findLatestOTP(
      user.id,
      verifyOtpDto.otp,
    );

    if (!otpRecord) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // Mark OTP as used instead of deleting it
    await this.authRepository.markOTPAsUsed(otpRecord.id);

    // Update last_login when user successfully logs in
    await this.authRepository.updateLastLogin(user.id);

    const payload = {
      email: user.email.toLowerCase(),
      userId: user.id,
      role: user.role,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email.toLowerCase(),
        role: user.role,
        name: user.name,
      },
    };
  }

  async login(loginDto: LoginDto, ipAddress: string) {
    const user = await this.validateUser(
      loginDto.email,
      loginDto.password,
      ipAddress,
    );
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      email: user.email.toLowerCase(),
      userId: user.id,
      role: user.role,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user,
    };
  }

  async register(registerDto: RegisterDto) {
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    const user = await this.authRepository.createUser(
      registerDto.name,
      registerDto.email.toLowerCase(),
      registerDto.role as RoleEnum,
      hashedPassword,
    );

    const { password, ...result } = user;
    return result;
  }

  async forgotPassword(
    forgotPasswordDto: ForgotPasswordDto,
    ipAddress?: string,
  ) {
    const user = await this.authRepository.findUserByEmail(
      forgotPasswordDto.email.toLowerCase(),
    );

    if (!user) {
      // For security reasons, we don't reveal if the email exists or not
      return {
        message: 'An email has been sent to this email address.',
        email: forgotPasswordDto.email,
      };
    }

    const otp = this.generateOTP();
    await this.authRepository.createOTP(
      user.id,
      otp,
      OtpPurpose.PASSWORD_RESET,
      ipAddress,
    );
    await this.sendPasswordResetEmail(user.email, otp);

    return {
      message:
        'An email has been sent to this email address with a password reset code.',
      email: forgotPasswordDto.email,
    };
  }

  async validateResetOtp(validateResetOtpDto: ValidateResetOtpDto) {
    const user = await this.authRepository.findUserByEmail(
      validateResetOtpDto.email.toLowerCase(),
    );

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const otpRecord = await this.authRepository.findLatestOTP(
      user.id,
      validateResetOtpDto.otp,
    );

    if (!otpRecord) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // Mark OTP as used
    await this.authRepository.markOTPAsUsed(otpRecord.id);

    // Generate a temporary reset token valid for 15 minutes
    const resetPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      type: 'password_reset',
    };

    const resetToken = this.jwtService.sign(resetPayload, { expiresIn: '15m' });

    return {
      message: 'OTP verified successfully. You can now reset your password.',
      resetToken,
      expiresIn: '15 minutes',
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    try {
      // Verify the reset token
      const decoded = this.jwtService.verify(resetPasswordDto.resetToken);

      if (decoded.type !== 'password_reset') {
        throw new UnauthorizedException('Invalid reset token');
      }

      const user = await this.authRepository.findUserByEmail(
        decoded.email.toLowerCase(),
      );

      if (!user || user.id !== decoded.userId) {
        throw new UnauthorizedException('Invalid reset token');
      }

      // Hash the new password
      const hashedPassword = await bcrypt.hash(
        resetPasswordDto.newPassword,
        10,
      );

      // Update the user's password
      await this.authRepository.updateUserPassword(user.id, hashedPassword);

      return {
        message:
          'Password has been reset successfully. You can now log in with your new password.',
        email: user.email,
      };
    } catch (error) {
      if (
        error.name === 'JsonWebTokenError' ||
        error.name === 'TokenExpiredError'
      ) {
        throw new UnauthorizedException('Invalid or expired reset token');
      }
      throw error;
    }
  }
}
