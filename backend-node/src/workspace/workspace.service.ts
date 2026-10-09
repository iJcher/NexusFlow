import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const INVITABLE_ROLES = [
  'Editor',
  'Operator',
  'Approver',
  'Viewer',
] as const;
export type MemberRole = (typeof INVITABLE_ROLES)[number];
type Tx = Prisma.TransactionClient;

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  private async active(tx: Tx, userId: string) {
    const user = await tx.userEntity.findUnique({
      where: { id: BigInt(userId) },
    });
    const [{ now }] = await tx.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    if (
      !user ||
      !user.isEnable ||
      user.isDeleted ||
      (user.lockoutEnabled &&
        user.lockoutEndDateUtc &&
        user.lockoutEndDateUtc > now)
    )
      throw new ForbiddenException();
    return { user, now };
  }

  private async locked<T>(id: string, action: (tx: Tx) => Promise<T>) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM "Workspace" WHERE id = ${id}::uuid FOR UPDATE`;
      if (!rows.length) throw new NotFoundException();
      return action(tx);
    });
  }

  private async owner(tx: Tx, workspaceId: string, userId: string) {
    const context = await this.active(tx, userId);
    const workspace = await tx.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
    });
    const member = await tx.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: context.user.id } },
    });
    if (workspace.ownerUserId !== context.user.id || member?.role !== 'Owner')
      throw new ForbiddenException();
    return context;
  }

  private role(value: string): MemberRole {
    if (!(INVITABLE_ROLES as readonly string[]).includes(value))
      throw new BadRequestException('INVALID_MEMBER_ROLE');
    return value as MemberRole;
  }

  private audit(
    tx: Tx,
    workspaceId: string,
    actor: string,
    action: string,
    targetId: string,
    role?: string,
  ) {
    return tx.workspaceAudit.create({
      data: { workspaceId, actorUserId: BigInt(actor), action, targetId, role },
    });
  }

  async ensurePrivate(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Serialize concurrent first creation with the existing user identity.
      await tx.$queryRaw`SELECT id FROM "UserEntity" WHERE id = ${BigInt(userId)} FOR UPDATE`;
      await this.active(tx, userId);
      const existing = await tx.workspace.findUnique({
        where: { ownerUserId: BigInt(userId) },
      });
      if (existing) return { id: existing.id, name: existing.name };
      const created = await tx.workspace.create({
        data: {
          ownerUserId: BigInt(userId),
          name: 'Private workspace',
          members: { create: { userId: BigInt(userId), role: 'Owner' } },
        },
      });
      await this.audit(tx, created.id, userId, 'workspace.created', created.id);
      return { id: created.id, name: created.name };
    });
  }

  async list(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.active(tx, userId);
      return tx.workspaceMember.findMany({
        where: { userId: BigInt(userId) },
        select: {
          workspaceId: true,
          role: true,
          workspace: { select: { name: true } },
        },
        orderBy: { workspaceId: 'asc' },
        take: 100,
      });
    });
  }

  async members(workspaceId: string, userId: string) {
    return this.locked(workspaceId, async (tx) => {
      await this.owner(tx, workspaceId, userId);
      const rows = await tx.workspaceMember.findMany({
        where: { workspaceId },
        select: { userId: true, role: true },
        orderBy: { userId: 'asc' },
        take: 1000,
      });
      return rows.map((row) => ({
        userId: row.userId.toString(),
        role: row.role,
      }));
    });
  }

  async invite(
    workspaceId: string,
    userId: string,
    rawEmail: string,
    rawRole: string,
  ) {
    const role = this.role(rawRole);
    const email = rawEmail.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new BadRequestException('INVALID_EMAIL');
    return this.locked(workspaceId, async (tx) => {
      const { user, now } = await this.owner(tx, workspaceId, userId);
      if (user.email?.trim().toLowerCase() === email)
        throw new ConflictException('SELF_INVITATION');
      const pending = {
        workspaceId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      };
      if (
        await tx.workspaceInvitation.findFirst({ where: { ...pending, email } })
      )
        throw new ConflictException('INVITATION_PENDING');
      if ((await tx.workspaceInvitation.count({ where: pending })) >= 100)
        throw new ConflictException('INVITATION_LIMIT');
      const invitation = await tx.workspaceInvitation.create({
        data: {
          workspaceId,
          email,
          role,
          invitedBy: user.id,
          expiresAt: new Date(now.getTime() + 7 * 86400_000),
        },
      });
      await this.audit(
        tx,
        workspaceId,
        userId,
        'invitation.created',
        invitation.id,
        role,
      );
      return { id: invitation.id, role, expiresAt: invitation.expiresAt };
    });
  }

  async accept(invitationId: string, userId: string) {
    const located = await this.prisma.workspaceInvitation.findUnique({
      where: { id: invitationId },
      select: { workspaceId: true },
    });
    if (!located) throw new NotFoundException();
    return this.locked(located.workspaceId, async (tx) => {
      const { user, now } = await this.active(tx, userId);
      const invitation = await tx.workspaceInvitation.findUniqueOrThrow({
        where: { id: invitationId },
      });
      if (
        !user.emailVerifiedAt ||
        !user.email ||
        user.email.trim().toLowerCase() !== invitation.email
      )
        throw new ForbiddenException();
      if (
        invitation.acceptedAt ||
        invitation.revokedAt ||
        invitation.expiresAt <= now
      )
        throw new ConflictException('INVITATION_UNAVAILABLE');
      // An invitation cannot silently replace an existing member's permissions.
      const key = { workspaceId: invitation.workspaceId, userId: user.id };
      if (
        await tx.workspaceMember.findUnique({
          where: { workspaceId_userId: key },
        })
      )
        throw new ConflictException('ALREADY_MEMBER');
      const role = this.role(invitation.role);
      await tx.workspaceMember.create({ data: { ...key, role } });
      await tx.workspaceInvitation.update({
        where: { id: invitationId },
        data: { acceptedAt: now, acceptedBy: user.id },
      });
      await this.audit(
        tx,
        key.workspaceId,
        userId,
        'invitation.accepted',
        invitationId,
        role,
      );
      return { workspaceId: key.workspaceId, role };
    });
  }

  async revoke(workspaceId: string, invitationId: string, userId: string) {
    return this.locked(workspaceId, async (tx) => {
      const { now } = await this.owner(tx, workspaceId, userId);
      const invitation = await tx.workspaceInvitation.findFirst({
        where: { id: invitationId, workspaceId },
      });
      if (!invitation) throw new NotFoundException();
      if (invitation.acceptedAt || invitation.revokedAt)
        throw new ConflictException('INVITATION_UNAVAILABLE');
      await tx.workspaceInvitation.update({
        where: { id: invitationId },
        data: { revokedAt: now },
      });
      await this.audit(
        tx,
        workspaceId,
        userId,
        'invitation.revoked',
        invitationId,
      );
      return { revoked: true };
    });
  }

  async changeMember(
    workspaceId: string,
    memberId: string,
    userId: string,
    rawRole?: string,
  ) {
    const role = rawRole === undefined ? undefined : this.role(rawRole);
    return this.locked(workspaceId, async (tx) => {
      await this.owner(tx, workspaceId, userId);
      const workspace = await tx.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
      });
      if (workspace.ownerUserId === BigInt(memberId))
        throw new ConflictException('OWNER_IMMUTABLE');
      const key = { workspaceId, userId: BigInt(memberId) };
      if (
        !(await tx.workspaceMember.findUnique({
          where: { workspaceId_userId: key },
        }))
      )
        throw new NotFoundException();
      if (role)
        await tx.workspaceMember.update({
          where: { workspaceId_userId: key },
          data: { role },
        });
      else
        await tx.workspaceMember.delete({ where: { workspaceId_userId: key } });
      await this.audit(
        tx,
        workspaceId,
        userId,
        role ? 'member.role_changed' : 'member.removed',
        memberId,
        role,
      );
      return { updated: true };
    });
  }
}
