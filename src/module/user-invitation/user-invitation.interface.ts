import { UserInvitation } from '@prisma/client';
import {
  AcceptInvitationDto,
  CreateInvitationDto,
  UpdateInvitationDto,
} from './user-invitation.dto';

export interface IUserInvitationRepository {
  create(
    data: CreateInvitationDto & {
      invited_by_id: string;
      invitation_token: string;
      expires_at: Date;
      portfolio_ids?: string[];
      sub_portfolio_ids?: string[];
      property_ids?: string[];
    },
  ): Promise<UserInvitation>;
  findById(id: string): Promise<UserInvitation | null>;
  findByToken(token: string): Promise<UserInvitation | null>;
  findByEmail(email: string): Promise<UserInvitation[]>;
  findAll(
    query: Record<string, any>,
  ): Promise<{ data: UserInvitation[]; metadata: any }>;
  update(id: string, data: UpdateInvitationDto): Promise<UserInvitation>;
  delete(id: string): Promise<UserInvitation>;
  findPendingByEmail(email: string): Promise<UserInvitation | null>;
  markAsAccepted(id: string, userId: string): Promise<UserInvitation>;
}

export interface IUserInvitationService {
  createInvitation(
    adminId: string,
    data: CreateInvitationDto,
  ): Promise<UserInvitation>;
  getAllInvitations(
    query: Record<string, any>,
  ): Promise<{ data: UserInvitation[]; metadata: any }>;
  getInvitationById(id: string): Promise<UserInvitation>;
  getInvitationByToken(token: string): Promise<UserInvitation>;
  updateInvitation(
    id: string,
    data: UpdateInvitationDto,
  ): Promise<UserInvitation>;
  deleteInvitation(id: string): Promise<UserInvitation>;
  resendInvitation(id: string, message?: string): Promise<UserInvitation>;
  acceptInvitation(
    token: string,
    data: AcceptInvitationDto,
  ): Promise<{ user: any; invitation: UserInvitation }>;
  cancelInvitation(id: string): Promise<UserInvitation>;
}
