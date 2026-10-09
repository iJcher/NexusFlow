import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserEntity } from '@prisma/client';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { nextId } from '../common/snowflake';
import { AuthConfig } from './auth.config';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { MailService } from './mail.service';
import { authError } from './auth.errors';
import { EmailLoginDto } from './dto/email-auth.dto';

export interface SafeUser {
  id: string;
  email: string | null;
  nickName: string;
  role: number;
}

type AuthResult = { user: UserEntity; sessionId: string; refreshToken: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AuthConfig,
    private readonly limits: AuthRateLimitService,
    private readonly mail: MailService,
  ) {}

  private async lock(
    tx: Prisma.TransactionClient,
    identity: string,
  ): Promise<void> {
    // SQL is fixed; identity is a bound parameter, never concatenated into SQL.
    await tx.$queryRawUnsafe(
      'SELECT 1 FROM pg_advisory_xact_lock(hashtextextended($1, 0))',
      identity,
    );
  }

  private digest(id: string, email: string, code: string): string {
    return createHmac('sha256', this.config.pepper)
      .update(JSON.stringify([id, email, 'login', code]))
      .digest('hex');
  }

  private tokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private enabled(user: UserEntity): boolean {
    return (
      !user.isDeleted &&
      user.isEnable !== false &&
      (!user.lockoutEndDateUtc ||
        user.lockoutEndDateUtc.getTime() <= Date.now())
    );
  }

  safeUser(user: UserEntity): SafeUser {
    return {
      id: user.id.toString(),
      email: user.email,
      nickName: user.nickName,
      role: user.role,
    };
  }

  async sendEmailCode(email: string, ip: string) {
    await this.limits.consume('send', email, ip);
    const id = randomUUID();
    const code = randomInt(0, 1000000).toString().padStart(6, '0');
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, 'auth:email:' + email);
      const state = await tx.authEmailState.findUnique({ where: { email } });
      const age = state
        ? Date.now() - state.lastRequestedAt.getTime()
        : Infinity;
      const pendingTtl = Math.max(
        this.config.cooldown,
        this.config.integer('SMTP_TIMEOUT_MS', 10000, 1000, 30000) / 1000 + 5,
      );
      const wait = state?.pendingChallengeId
        ? pendingTtl
        : this.config.cooldown;
      if (age < wait * 1000) {
        throw authError(
          429,
          'AUTH_COOLDOWN',
          '请稍后再发送验证码',
          Math.ceil(wait - age / 1000),
        );
      }
      if (state?.pendingChallengeId) {
        await tx.emailLoginChallenge.updateMany({
          where: { id: state.pendingChallengeId, sendState: 'pending' },
          data: { sendState: 'failed' },
        });
      }
      await tx.emailLoginChallenge.create({
        data: {
          id,
          email,
          codeHash: this.digest(id, email, code),
          expiresAt: new Date(Date.now() + this.config.codeTtl * 1000),
        },
      });
      await tx.authEmailState.upsert({
        where: { email },
        create: { email, lastRequestedAt: new Date(), pendingChallengeId: id },
        update: { lastRequestedAt: new Date(), pendingChallengeId: id },
      });
    });

    try {
      await this.mail.sendLoginCode(email, code);
    } catch {
      await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, 'auth:email:' + email);
        // A timeout may mean the mail was accepted. Never enable this challenge.
        await tx.emailLoginChallenge.updateMany({
          where: { id, sendState: 'pending' },
          data: { sendState: 'delivery_unknown' },
        });
        await tx.authEmailState.updateMany({
          where: { email, pendingChallengeId: id },
          data: { pendingChallengeId: null },
        });
      });
      throw authError(
        503,
        'AUTH_EMAIL_DELIVERY_FAILED',
        '邮件发送未确认，请稍后重试',
      );
    }

    const expiresAt = new Date(Date.now() + this.config.codeTtl * 1000);
    const activated = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, 'auth:email:' + email);
      const state = await tx.authEmailState.findUnique({ where: { email } });
      if (state?.pendingChallengeId !== id) return false;
      if (state.activeChallengeId) {
        await tx.emailLoginChallenge.updateMany({
          where: { id: state.activeChallengeId, consumedAt: null },
          data: { sendState: 'superseded' },
        });
      }
      await tx.emailLoginChallenge.update({
        where: { id },
        data: { sendState: 'sent', expiresAt },
      });
      await tx.authEmailState.update({
        where: { email },
        data: { activeChallengeId: id, pendingChallengeId: null },
      });
      return true;
    });
    if (!activated)
      throw authError(
        503,
        'AUTH_EMAIL_DELIVERY_FAILED',
        '邮件发送未确认，请稍后重试',
      );
    return {
      challengeId: id,
      expiresAt: expiresAt.toISOString(),
      retryAfter: this.config.cooldown,
    };
  }

  private async newSession(
    tx: Prisma.TransactionClient,
    user: UserEntity,
    familyId: string = randomUUID(),
  ): Promise<AuthResult> {
    const refreshToken = randomBytes(32).toString('base64url');
    const session = await tx.authSession.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        familyId,
        tokenHash: this.tokenHash(refreshToken),
        expiresAt: new Date(Date.now() + this.config.refreshTtl * 1000),
      },
    });
    return { user, sessionId: session.id, refreshToken };
  }

  private async issue(result: AuthResult) {
    const accessToken = await this.jwt.signAsync(
      { sub: result.user.id.toString(), sid: result.sessionId, authVersion: 2 },
      {
        expiresIn: this.config.accessTtl,
        issuer: this.config.issuer,
        audience: this.config.audience,
      },
    );
    return {
      body: {
        type: 'Bearer',
        accessToken,
        expiresIn: this.config.accessTtl,
        user: this.safeUser(result.user),
      },
      refreshToken: result.refreshToken,
    };
  }

  async login(dto: EmailLoginDto, ip: string) {
    await this.limits.consume('verify', dto.email, ip);
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, 'auth:email:' + dto.email);
      const state = await tx.authEmailState.findUnique({
        where: { email: dto.email },
      });
      const challenge = await tx.emailLoginChallenge.findUnique({
        where: { id: dto.challengeId },
      });
      if (
        !challenge ||
        challenge.email !== dto.email ||
        challenge.purpose !== 'login' ||
        state?.activeChallengeId !== challenge.id ||
        challenge.sendState !== 'sent' ||
        challenge.consumedAt ||
        challenge.expiresAt.getTime() <= Date.now()
      )
        return { error: 'invalid' } as const;
      if (challenge.attempts >= this.config.maxAttempts)
        return { error: 'locked' } as const;
      const actual = Buffer.from(
        this.digest(challenge.id, dto.email, dto.code),
        'hex',
      );
      const expected = Buffer.from(challenge.codeHash, 'hex');
      if (
        expected.length !== actual.length ||
        !timingSafeEqual(expected, actual)
      ) {
        await tx.emailLoginChallenge.update({
          where: { id: challenge.id },
          data: { attempts: { increment: 1 } },
        });
        return {
          error:
            challenge.attempts + 1 >= this.config.maxAttempts
              ? 'locked'
              : 'invalid',
        } as const;
      }
      let user = await tx.userEntity.findUnique({
        where: { email: dto.email },
      });
      if (user && !this.enabled(user)) return { error: 'disabled' } as const;
      if (!user) {
        user = await tx.userEntity.create({
          data: {
            id: nextId(),
            email: dto.email,
            emailVerifiedAt: new Date(),
            nickName: dto.email.split('@')[0],
            lastLoginIp: ip,
            role: 1,
          },
        });
      } else {
        user = await tx.userEntity.update({
          where: { id: user.id },
          data: {
            emailVerifiedAt: user.emailVerifiedAt || new Date(),
            lastLoginIp: ip,
            lastLoginTime: new Date(),
          },
        });
      }
      await tx.emailLoginChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      return this.newSession(tx, user);
    });
    // Throw outside the transaction so incorrect-attempt counters are committed.
    if ('error' in result) {
      if (result.error === 'locked')
        throw authError(
          429,
          'AUTH_CODE_LOCKED',
          '验证码尝试次数已达上限，请稍后重发',
          this.config.cooldown,
        );
      if (result.error === 'disabled')
        throw authError(403, 'AUTH_ACCOUNT_UNAVAILABLE', '账户暂不可用');
      throw authError(401, 'AUTH_CODE_INVALID', '验证码无效或已过期');
    }
    return this.issue(result);
  }

  async refresh(refreshToken: string, ip: string) {
    await this.limits.consume('refresh', this.tokenHash(refreshToken), ip);
    const previous = await this.prisma.authSession.findUnique({
      where: { tokenHash: this.tokenHash(refreshToken) },
    });
    if (!previous) throw authError(401, 'AUTH_SESSION_INVALID', '请重新登录');
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, 'auth:family:' + previous.familyId);
      const session = await tx.authSession.findUnique({
        where: { id: previous.id },
        include: { user: true },
      });
      if (!session) return null;
      if (session.revokedAt || session.replacedById) {
        await tx.authSession.updateMany({
          where: { familyId: session.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return null;
      }
      if (
        session.expiresAt.getTime() <= Date.now() ||
        !this.enabled(session.user)
      ) {
        await tx.authSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
        return null;
      }
      const next = await this.newSession(tx, session.user, session.familyId);
      await tx.authSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), replacedById: next.sessionId },
      });
      return next;
    });
    if (!result) throw authError(401, 'AUTH_SESSION_INVALID', '请重新登录');
    return this.issue(result);
  }

  async logout(refreshToken: string | null): Promise<void> {
    if (!refreshToken) return;
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: this.tokenHash(refreshToken) },
    });
    if (!session) return;
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, 'auth:family:' + session.familyId);
      await tx.authSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  async authenticatedUser(userId: string, sessionId: string) {
    if (!/^\d+$/.test(userId) || !/^[0-9a-f-]{36}$/i.test(sessionId))
      return null;
    const session = await this.prisma.authSession.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    if (
      !session ||
      session.userId.toString() !== userId ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      !this.enabled(session.user)
    )
      return null;
    return {
      ...this.safeUser(session.user),
      phoneNumber: session.user.phoneNumber || '',
      sessionId: session.id,
    };
  }
}
