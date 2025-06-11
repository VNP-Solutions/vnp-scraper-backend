import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvitationStatus, RoleEnum, UserInvitation } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import { UserFeatureAccessPermissionDto } from '../user-feature-access-permission/user-feature-access-permission.dto';
import { IUserFeatureAccessPermissionService } from '../user-feature-access-permission/user-feature-access-permission.interface';
import { IUserRepository } from '../user/user.interface';
import {
  AcceptInvitationDto,
  CreateInvitationDto,
  UpdateInvitationDto,
} from './user-invitation.dto';
import {
  IUserInvitationRepository,
  IUserInvitationService,
} from './user-invitation.interface';

const crypto = require('crypto');

@Injectable()
export class UserInvitationService implements IUserInvitationService {
  private transporter: nodemailer.Transporter;

  constructor(
    @Inject('IUserInvitationRepository')
    private readonly invitationRepository: IUserInvitationRepository,
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
    @Inject('IUserFeatureAccessPermissionService')
    private readonly userFeatureAccessPermissionService: IUserFeatureAccessPermissionService,
    private readonly configService: ConfigService,
    private readonly logger: Logger,
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

  private generateInvitationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private async sendInvitationEmail(
    email: string,
    invitationToken: string,
    invitedByName: string,
    message?: string,
  ): Promise<void> {
    const invitationUrl = `${this.configService.get('FRONTEND_URL')}/accept-invitation?token=${invitationToken}`;

    const emailHTML = `
    <body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f4; color: #333333; line-height: 1.6;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <tr>
          <td style="padding: 30px 20px; text-align: center; background-color: #ffffff; border-bottom: 1px solid #eeeeee;">
            <img src="https://argobot-bucket.s3.us-east-2.amazonaws.com/VNP+LOGO_PNG.png" alt="VNP Solutions Logo" style="max-width: 200px; height: auto;">
          </td>
        </tr>
        <tr>
          <td style="padding: 30px 30px 20px 30px;">
            <h1 style="margin: 0 0 20px 0; font-size: 24px; line-height: 32px; font-weight: 700; color: #333333;">You're Invited to Join VNP Solutions</h1>
            <p style="margin: 0 0 20px 0; font-size: 16px;">Hello,</p>
            <p style="margin: 0 0 20px 0; font-size: 16px;">${invitedByName} has invited you to join the VNP Solutions Dashboard. You can now access our platform to manage your properties and portfolios.</p>
            ${message ? `<p style="margin: 0 0 20px 0; font-size: 16px; font-style: italic; background-color: #f8f9fa; padding: 15px; border-radius: 6px; border-left: 4px solid #0066cc;">"${message}"</p>` : ''}
            
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0;">
              <tr>
                <td style="text-align: center;">
                  <a href="${invitationUrl}" style="display: inline-block; padding: 15px 30px; background-color: #0066cc; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Accept Invitation</a>
                </td>
              </tr>
            </table>
            
            <p style="margin: 20px 0 0 0; font-size: 14px; color: #666666;">If the button above doesn't work, copy and paste this link into your browser:</p>
            <p style="margin: 5px 0 0 0; font-size: 14px; color: #0066cc; word-break: break-all;">${invitationUrl}</p>
            
            <p style="margin: 30px 0 0 0; font-size: 14px; color: #666666;">This invitation will expire in 7 days. If you have any questions, please contact our support team.</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 20px 30px; background-color: #f8f9fa; border-top: 1px solid #eeeeee;">
            <p style="margin: 0; font-size: 12px; color: #666666; text-align: center;">
              © 2024 VNP Solutions. All rights reserved.<br>
              This invitation was sent by ${invitedByName} on behalf of VNP Solutions.
            </p>
          </td>
        </tr>
      </table>
    </body>`;

    const mailOptions = {
      from: 'VNP Team <team@vnp.app>',
      to: email,
      subject: `You're invited to join VNP Solutions by ${invitedByName}`,
      text: `You've been invited to join VNP Solutions by ${invitedByName}. Click this link to accept: ${invitationUrl}`,
      html: emailHTML,
    };

    await this.transporter.sendMail(mailOptions);
  }

  async createInvitation(
    adminId: string,
    data: CreateInvitationDto,
  ): Promise<UserInvitation> {
    try {
      // Check if user already exists
      const existingUser = await this.userRepository.findByEmail(
        data.email.toLowerCase(),
      );
      if (existingUser) {
        throw new ConflictException('A user with this email already exists');
      }

      // Check if there's already a pending invitation
      const existingInvitation =
        await this.invitationRepository.findPendingByEmail(
          data.email.toLowerCase(),
        );
      if (existingInvitation) {
        throw new ConflictException(
          'A pending invitation for this email already exists',
        );
      }

      // Get admin details for the email
      const admin = await this.userRepository.findById(adminId);
      if (!admin) {
        throw new NotFoundException('Admin not found');
      }

      const invitationToken = this.generateInvitationToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      // If user role is admin, clear permission arrays since admins have full access
      let portfolioIds = data.portfolio_ids || [];
      let subPortfolioIds = data.sub_portfolio_ids || [];
      let propertyIds = data.property_ids || [];

      if (data.role === RoleEnum.admin) {
        portfolioIds = [];
        subPortfolioIds = [];
        propertyIds = [];
        this.logger.log(
          `Admin invitation created for ${data.email} - permission arrays cleared as admin has full access`,
        );
      }

      const invitation = await this.invitationRepository.create({
        ...data,
        email: data.email.toLowerCase(),
        invited_by_id: adminId,
        invitation_token: invitationToken,
        expires_at: expiresAt,
        portfolio_ids: portfolioIds,
        sub_portfolio_ids: subPortfolioIds,
        property_ids: propertyIds,
      });

      // Send invitation email
      await this.sendInvitationEmail(
        data.email,
        invitationToken,
        admin.name,
        data.message,
      );

      return invitation;
    } catch (error) {
      this.logger.error(
        `Error creating invitation: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getAllInvitations(
    query: Record<string, any>,
  ): Promise<{ invitations: UserInvitation[]; metadata: any }> {
    return this.invitationRepository.findAll(query);
  }

  async getInvitationById(id: string): Promise<UserInvitation> {
    const invitation = await this.invitationRepository.findById(id);
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    return invitation;
  }

  async getInvitationByToken(token: string): Promise<UserInvitation> {
    const invitation = await this.invitationRepository.findByToken(token);
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== InvitationStatus.Pending) {
      throw new BadRequestException('This invitation is no longer valid');
    }

    if (invitation.expires_at < new Date()) {
      throw new BadRequestException('This invitation has expired');
    }

    return invitation;
  }

  async updateInvitation(
    id: string,
    data: UpdateInvitationDto,
  ): Promise<UserInvitation> {
    const invitation = await this.getInvitationById(id);

    // If updating role to admin, clear permission arrays since admins have full access
    const updateData = { ...data };
    if (data.role === RoleEnum.admin) {
      updateData.portfolio_ids = [];
      updateData.sub_portfolio_ids = [];
      updateData.property_ids = [];
      this.logger.log(
        `Invitation ${id} updated to admin role - permission arrays cleared as admin has full access`,
      );
    }

    return this.invitationRepository.update(id, updateData);
  }

  async deleteInvitation(id: string): Promise<UserInvitation> {
    const invitation = await this.getInvitationById(id);
    return this.invitationRepository.delete(id);
  }

  async resendInvitation(
    id: string,
    message?: string,
  ): Promise<UserInvitation> {
    const invitation = await this.getInvitationById(id);

    if (invitation.status !== InvitationStatus.Pending) {
      throw new BadRequestException('Can only resend pending invitations');
    }

    // Generate new token and extend expiry
    const newToken = this.generateInvitationToken();
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + 7);

    const updatedInvitation = await this.invitationRepository.update(id, {
      invitation_token: newToken,
      expires_at: newExpiresAt,
      ...(message && { message }),
    } as any);

    // Send new invitation email
    await this.sendInvitationEmail(
      invitation.email,
      newToken,
      (invitation as any).invitedBy?.name || 'Admin',
      message || invitation.message,
    );

    return updatedInvitation;
  }

  async acceptInvitation(
    token: string,
    data: AcceptInvitationDto,
  ): Promise<{ user: any; invitation: UserInvitation }> {
    const invitation = await this.getInvitationByToken(token);

    // Check if user already exists (double check)
    const existingUser = await this.userRepository.findByEmail(
      invitation.email,
    );
    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Create user
    const user = await this.userRepository.create({
      email: invitation.email,
      password: hashedPassword,
      name: data.name,
      role: invitation.role,
      phone_number: data.phone_number,
      invited_user_id: invitation.invited_by_id,
      is_verified: true,
    });

    // Create permissions if user role is partial and invitation has access permissions
    if (invitation.role === RoleEnum.partial) {
      await this.createUserPermissions(user.id, invitation);
    }

    // Mark invitation as accepted
    const updatedInvitation = await this.invitationRepository.markAsAccepted(
      invitation.id,
      user.id,
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone_number: user.phone_number,
        is_verified: user.is_verified,
      },
      invitation: updatedInvitation,
    };
  }

  private async createUserPermissions(
    userId: string,
    invitation: any,
  ): Promise<void> {
    try {
      const permissions: UserFeatureAccessPermissionDto[] = [];

      // Create permissions for portfolios
      if (invitation.portfolio_ids && invitation.portfolio_ids.length > 0) {
        for (const portfolioId of invitation.portfolio_ids) {
          permissions.push({
            user_id: userId,
            portfolio_id: portfolioId,
            sub_portfolio_id: null,
            property_id: null,
          });
        }
      }

      // Create permissions for sub-portfolios
      if (
        invitation.sub_portfolio_ids &&
        invitation.sub_portfolio_ids.length > 0
      ) {
        for (const subPortfolioId of invitation.sub_portfolio_ids) {
          permissions.push({
            user_id: userId,
            portfolio_id: null,
            sub_portfolio_id: subPortfolioId,
            property_id: null,
          });
        }
      }

      // Create permissions for properties
      if (invitation.property_ids && invitation.property_ids.length > 0) {
        for (const propertyId of invitation.property_ids) {
          permissions.push({
            user_id: userId,
            portfolio_id: null,
            sub_portfolio_id: null,
            property_id: propertyId,
          });
        }
      }

      // Create all permissions at once
      if (permissions.length > 0) {
        await this.userFeatureAccessPermissionService.createOrUpdateUserFeatureAccessPermission(
          permissions,
        );
        this.logger.log(
          `Created ${permissions.length} permissions for user ${userId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error creating user permissions: ${error.message}`,
        error.stack,
      );
      // Note: We don't throw here to avoid breaking user creation, but we log the error
    }
  }

  async cancelInvitation(id: string): Promise<UserInvitation> {
    const invitation = await this.getInvitationById(id);

    if (invitation.status !== InvitationStatus.Pending) {
      throw new BadRequestException('Can only cancel pending invitations');
    }

    return this.invitationRepository.update(id, {
      status: InvitationStatus.Cancelled,
    });
  }
}
