import { Injectable } from '@nestjs/common';
import { InvitationStatus, UserInvitation } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import {
  CreateInvitationDto,
  UpdateInvitationDto,
} from './user-invitation.dto';
import { IUserInvitationRepository } from './user-invitation.interface';

@Injectable()
export class UserInvitationRepository implements IUserInvitationRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(
    data: CreateInvitationDto & {
      invited_by_id: string;
      invitation_token: string;
      expires_at: Date;
    },
  ): Promise<UserInvitation> {
    return this.db.userInvitation.create({
      data,
      include: {
        invitedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async findById(id: string): Promise<UserInvitation | null> {
    return this.db.userInvitation.findUnique({
      where: { id },
      include: {
        invitedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        invitedUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async findByToken(token: string): Promise<UserInvitation | null> {
    return this.db.userInvitation.findUnique({
      where: { invitation_token: token },
      include: {
        invitedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async findByEmail(email: string): Promise<UserInvitation[]> {
    return this.db.userInvitation.findMany({
      where: { email },
      include: {
        invitedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll(
    query: Record<string, any>,
  ): Promise<{ data: UserInvitation[]; metadata: any }> {
    const { page = 1, limit = 10, status, role, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (role) {
      where.role = role;
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { invitedBy: { name: { contains: search, mode: 'insensitive' } } },
        { invitedBy: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.db.userInvitation.findMany({
        where,
        include: {
          invitedBy: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          invitedUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.db.userInvitation.count({ where }),
    ]);

    return {
      data,
      metadata: {
        totalDocuments: total,
        currentPage: page,
        totalPage: Math.ceil(total / limit),
        limit: limit,
      },
    };
  }

  async update(id: string, data: UpdateInvitationDto): Promise<UserInvitation> {
    return this.db.userInvitation.update({
      where: { id },
      data,
      include: {
        invitedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        invitedUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async delete(id: string): Promise<UserInvitation> {
    return this.db.userInvitation.delete({
      where: { id },
    });
  }

  async findPendingByEmail(email: string): Promise<UserInvitation | null> {
    return this.db.userInvitation.findFirst({
      where: {
        email,
        status: InvitationStatus.Pending,
        expires_at: {
          gt: new Date(),
        },
      },
      include: {
        invitedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async markAsAccepted(id: string, userId: string): Promise<UserInvitation> {
    return this.db.userInvitation.update({
      where: { id },
      data: {
        status: InvitationStatus.Accepted,
        invited_user_id: userId,
        accepted_at: new Date(),
      },
      include: {
        invitedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        invitedUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }
}
