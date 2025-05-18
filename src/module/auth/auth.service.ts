import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginDto, RegisterDto } from './auth.dto';
import { RoleEnum } from '@prisma/client';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { AuthRepository } from './auth.repository';

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
    return Math.floor(100000 + Math.random() * 900000).toString();
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
</body>`
    const mailOptions = {
      from: 'VNP Team team@vnp.app',
      to: email,
      subject: 'Verify your login to the VNP Dashboard',
      text: `Your OTP for login is: ${otp}.`,
      html: emailHTML,
    };

    await this.transporter.sendMail(mailOptions);
  }

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.authRepository.findUserByEmail(email);
    if (user && (await bcrypt.compare(password, user.password))) {
      const otp = this.generateOTP();
      
      await this.authRepository.createOTP(user.id, otp);
      await this.sendOTPEmail(email, otp);
      
      return { email: user.email };
    }
    throw new UnauthorizedException('Invalid credentials');
  }

  async verifyOTP(verifyOtpDto: VerifyOtpDto) {
    const user = await this.authRepository.findUserByEmail(verifyOtpDto.email);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const otpRecord = await this.authRepository.findLatestOTP(user.id, verifyOtpDto.otp);

    if (!otpRecord) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    await this.authRepository.deleteOTP(otpRecord.id);

    const payload = { email: user.email, userId: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { email: user.email, userId: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user,
    };
  }

  async register(registerDto: RegisterDto) {
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    const user = await this.authRepository.createUser(
      registerDto.name,
      registerDto.email,
      registerDto.role as RoleEnum,
      hashedPassword
    );

    const { password, ...result } = user;
    return result;
  }
}