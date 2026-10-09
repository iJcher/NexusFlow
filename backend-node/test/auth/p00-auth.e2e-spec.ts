import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, type Socket, type AddressInfo } from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import type { Server } from 'node:http';
import { PrismaClient } from '@prisma/client';
import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthModule } from '../../src/auth/auth.module';
import { JwtAuthGuard } from '../../src/auth/jwt-auth.guard';
import { configureApplication } from '../../src/bootstrap';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthConfig } from '../../src/auth/auth.config';
import { MailService } from '../../src/auth/mail.service';
import { assertSingleUse } from './assertions';

const origin = 'http://127.0.0.1:5175';
const prefix = `p00-${randomBytes(8).toString('hex')}`;
const emails = new Set<string>();
const legacyIds: bigint[] = [];
const mailpit = process.env.P00_MAILPIT_URL || 'http://127.0.0.1:18025';
let app: INestApplication;
let secondApp: INestApplication;
let brokenSmtpApp: INestApplication;
let prisma: PrismaService;

type Challenge = { challengeId: string; expiresAt: string; retryAfter: number };
type Identity = { email: string; challenge: Challenge; code: string };
type ApiPayload = Challenge & {
  type: string;
  accessToken: string;
  expiresIn: number;
  user: Record<string, unknown> & { id: string; email: string };
  id: string;
  email: string;
  UserId: string;
};
type ApiBody = { errCode: number; errMsg: string; data: ApiPayload };
function body(response: request.Response): ApiBody {
  return response.body as ApiBody;
}
function serverOf(target: INestApplication): Server {
  return target.getHttpServer() as Server;
}
type MailSummary = { ID: string; To: { Address: string }[] };

function testEmail(label: string): string {
  const value = `${prefix}-${label}@nexus.test`;
  emails.add(value);
  return value;
}

async function application(overrides: Record<string, string | undefined> = {}) {
  overrides = { AUTH_REDIS_PREFIX: `nf:p00:api:${prefix}:`, ...overrides };
  const previous = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AuthModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
    })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({ ...process.env }))
      .compile();
    const instance = module.createNestApplication({ logger: false });
    configureApplication(instance);
    await instance.init();
    return instance;
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function readCode(email: string): Promise<string> {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const listResponse = await fetch(`${mailpit}/api/v1/messages?limit=200`);
    if (!listResponse.ok)
      throw new Error(
        'Mailpit unavailable; SMTP integration cannot be asserted',
      );
    const list = (await listResponse.json()) as { messages: MailSummary[] };
    const message = list.messages.find((item) =>
      item.To.some((to) => to.Address === email),
    );
    if (message) {
      const detailResponse = await fetch(
        `${mailpit}/api/v1/message/${message.ID}`,
      );
      if (!detailResponse.ok)
        throw new Error('Mailpit message detail unavailable');
      const detail = (await detailResponse.json()) as {
        Text?: string;
        HTML?: string;
      };
      const code = `${detail.Text || ''} ${detail.HTML || ''}`.match(
        /\b\d{6}\b/,
      )?.[0];
      if (!code)
        throw new Error(
          'Delivered email does not contain a six-digit login code',
        );
      return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('SMTP delivery to Mailpit was not observed');
}

async function challenge(email: string, target = app): Promise<Challenge> {
  const response = await request(serverOf(target))
    .post('/auth/email/code')
    .send({ email })
    .expect(202);
  expect(body(response).errCode).toBe(0);
  expect(body(response).errMsg).toBe('');
  const result = body(response).data as Challenge;
  expect(Object.keys(result).sort()).toEqual([
    'challengeId',
    'expiresAt',
    'retryAfter',
  ]);
  expect(result.challengeId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(result.retryAfter).toBe(60);
  expect(Date.parse(result.expiresAt) > Date.now()).toBe(true);
  return result;
}

async function identity(label: string): Promise<Identity> {
  const email = testEmail(label);
  const issued = await challenge(email);
  return { email, challenge: issued, code: await readCode(email) };
}

function login(value: Identity, code = value.code, target = app) {
  return request(serverOf(target))
    .post('/auth/email/login')
    .set('Origin', origin)
    .send({
      email: value.email,
      challengeId: value.challenge.challengeId,
      code,
    });
}

function refreshCookie(response: request.Response): string {
  const headers = response.headers['set-cookie'] as unknown as
    | string[]
    | undefined;
  const item = headers?.find((value) => value.startsWith('nf_refresh='));
  if (!item) throw new Error('Refresh cookie was not set');
  expect(/httponly/i.test(item)).toBe(true);
  expect(/path=\/auth(?:;|$)/i.test(item)).toBe(true);
  expect(/samesite=(strict|lax)/i.test(item)).toBe(true);
  return item.split(';')[0];
}

function assertPublicUser(user: Record<string, unknown>) {
  expect(Object.keys(user).sort()).toEqual(['email', 'id', 'nickName', 'role']);
}

async function worker(
  overrides: Record<string, string> = {},
): Promise<{ child: ChildProcess; url: string }> {
  const child = spawn(
    process.execPath,
    [
      '-r',
      'ts-node/register/transpile-only',
      resolve(__dirname, 'auth-worker.ts'),
    ],
    {
      cwd: resolve(__dirname, '../..'),
      env: {
        ...process.env,
        AUTH_REDIS_PREFIX: `nf:p00:worker:${prefix}:`,
        ...overrides,
      },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    },
  );
  return new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Acceptance subprocess did not become ready'));
    }, 20000);
    child.once('error', () => {
      clearTimeout(timer);
      reject(new Error('Could not launch acceptance subprocess'));
    });
    child.once('exit', () => {
      clearTimeout(timer);
      reject(new Error('Acceptance subprocess exited before ready'));
    });
    child.on('message', (message: { type?: string; url?: string }) => {
      if (message.type === 'ready' && message.url) {
        clearTimeout(timer);
        resolveReady({ child, url: message.url });
      }
    });
  });
}

async function stopWorker(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const stopped = new Promise<void>((resolveStopped) =>
    child.once('exit', () => resolveStopped()),
  );
  child.kill('SIGKILL');
  await stopped;
}

async function runPrisma(args: string[], url: string): Promise<void> {
  const child = spawn(
    process.execPath,
    [resolve(__dirname, '../../node_modules/prisma/build/index.js'), ...args],
    {
      cwd: resolve(__dirname, '../..'),
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'ignore',
    },
  );
  await new Promise<void>((resolveDone, reject) => {
    child.once('error', () =>
      reject(new Error('Migration CLI could not start')),
    );
    child.once('exit', (code) =>
      code === 0
        ? resolveDone()
        : reject(new Error(`Migration CLI failed with exit ${code}`)),
    );
  });
}

describe('P00 independent authentication acceptance: real PostgreSQL, Redis and SMTP', () => {
  beforeAll(async () => {
    const database = new URL(process.env.DATABASE_URL || '');
    if (
      !['127.0.0.1', 'localhost'].includes(database.hostname) ||
      database.pathname !== '/nexus_test'
    ) {
      throw new Error(
        'Refusing authentication acceptance against a non-isolated database',
      );
    }
    app = await application();
    secondApp = await application();
    brokenSmtpApp = await application({ SMTP_PORT: '9' });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.userEntity.findMany({
        where: { email: { in: [...emails] } },
        select: { id: true },
      });
      const ids = [...users.map((user) => user.id), ...legacyIds];
      await prisma.authSession.deleteMany({ where: { userId: { in: ids } } });
      await prisma.flowEntity.deleteMany({
        where: { ownerUserId: { in: legacyIds } },
      });
      await prisma.userEntity.deleteMany({ where: { id: { in: ids } } });
      await prisma.emailLoginChallenge.deleteMany({
        where: { email: { in: [...emails] } },
      });
      await prisma.authEmailState.deleteMany({
        where: { email: { in: [...emails] } },
      });
    }
    await Promise.all([
      app?.close(),
      secondApp?.close(),
      brokenSmtpApp?.close(),
    ]);
  });

  it('P00-AUTH-01 SMTP delivered code authenticates a verified identity; output is a whitelist', async () => {
    const value = await identity('happy');
    const response = await login(value).expect(200);
    expect(body(response).errCode).toBe(0);
    expect(body(response).data.type).toBe('Bearer');
    expect(typeof body(response).data.accessToken).toBe('string');
    expect(body(response).data.expiresIn > 0).toBe(true);
    expect('refreshToken' in body(response).data).toBe(false);
    assertPublicUser(body(response).data.user);
    refreshCookie(response);
    const user = await prisma.userEntity.findUniqueOrThrow({
      where: { email: value.email },
    });
    expect(user.emailVerifiedAt !== null).toBe(true);
    expect(
      await prisma.authSession.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(1);
    const stored = await prisma.emailLoginChallenge.findUniqueOrThrow({
      where: { id: value.challenge.challengeId },
    });
    expect(stored.consumedAt !== null).toBe(true);
    expect(stored.codeHash === value.code).toBe(false);
    expect(JSON.stringify(stored).includes(`"${value.code}"`)).toBe(false);
    const bearer = `Bearer ${body(response).data.accessToken}`;
    for (const endpoint of ['/auth/me']) {
      const me = await request(serverOf(app))
        .get(endpoint)
        .set('Authorization', bearer)
        .expect(200);
      assertPublicUser(body(me).data);
      expect(body(me).data.id === body(response).data.user.id).toBe(true);
    }
    const legacyMe = await request(serverOf(app))
      .get('/UserAccount/GetCurrentUser')
      .set('Authorization', bearer)
      .expect(200);
    expect(Object.keys(body(legacyMe).data).sort()).toEqual([
      'Email',
      'NickName',
      'Role',
      'UserId',
    ]);
    expect(body(legacyMe).data.UserId === body(response).data.user.id).toBe(
      true,
    );
    const own = await request(serverOf(app))
      .get('/UserAccount/GetUserById')
      .query({ id: user.id.toString() })
      .set('Authorization', bearer)
      .expect(200);
    assertPublicUser(body(own).data);
    await request(serverOf(app))
      .get('/UserAccount/GetUserById')
      .query({ id: '999999999999999999' })
      .set('Authorization', bearer)
      .expect(403);
    const listResponse = await request(serverOf(app))
      .get('/UserAccount/GetUsers')
      .set('Authorization', bearer)
      .expect(200);
    const list = body(listResponse).data as unknown as Record<
      string,
      unknown
    >[];
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(1);
    expect(list[0].id === user.id.toString()).toBe(true);
    expect(Object.keys(list[0]).sort()).toEqual([
      'email',
      'id',
      'nickName',
      'phoneNumber',
    ]);
  });

  it('P00-AUTH-02 direct API validates types, whitespace, controls, excess fields and code structure', async () => {
    for (const payload of [
      {},
      { email: '' },
      { email: 'invalid' },
      { email: 42 },
      { email: 'a@nexus.test\r\nBcc:x@y.test' },
      { email: 'a@nexus.test', code: '111111' },
    ]) {
      const response = await request(serverOf(app))
        .post('/auth/email/code')
        .send(payload)
        .expect(400);
      expect(body(response).errCode).toBe(400);
    }
    for (const code of ['', '12345', '1234567', 'abcdef', 123456]) {
      await request(serverOf(app))
        .post('/auth/email/login')
        .set('Origin', origin)
        .send({
          email: testEmail('invalid-code'),
          challengeId: randomUUID(),
          code,
        })
        .expect(400);
    }
    const email = testEmail('legal+tag');
    const issued = await challenge(
      `  ${email.replace('@nexus.test', '@NEXUS.TEST')}  `,
    );
    const code = await readCode(email);
    const response = await login({ email, code, challenge: issued }).expect(
      200,
    );
    expect(body(response).data.user.email).toBe(email);
  });

  it('P00-AUTH-03 wrong guesses persist, fifth locks and correct code cannot bypass', async () => {
    const value = await identity('attempt-limit');
    const wrong = value.code === '000000' ? '000001' : '000000';
    for (let attempt = 1; attempt <= 5; attempt++) {
      await login(value, wrong).expect(attempt < 5 ? 401 : 429);
      const stored = await prisma.emailLoginChallenge.findUniqueOrThrow({
        where: { id: value.challenge.challengeId },
      });
      expect(stored.attempts).toBe(attempt);
    }
    const locked = await login(value).expect(429);
    expect(Number(locked.headers['retry-after']) > 0).toBe(true);
    expect(
      await prisma.userEntity.count({ where: { email: value.email } }),
    ).toBe(0);
  });

  it('P00-AUTH-03 rejects expired, mismatched purpose/email, disabled and consumed challenges', async () => {
    const expired = await identity('expired');
    await prisma.emailLoginChallenge.update({
      where: { id: expired.challenge.challengeId },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await login(expired).expect(401);
    const purpose = await identity('purpose');
    await prisma.emailLoginChallenge.update({
      where: { id: purpose.challenge.challengeId },
      data: { purpose: 'not-login' },
    });
    await login(purpose).expect(401);
    const mismatch = await identity('mismatch');
    await login({ ...mismatch, email: testEmail('different-email') }).expect(
      401,
    );
    await login(mismatch).expect(200);
    await login(mismatch).expect(401);
    const disabled = await identity('disabled');
    const id = BigInt(`0x${randomBytes(7).toString('hex')}`);
    await prisma.userEntity.create({
      data: {
        id,
        email: disabled.email,
        emailVerifiedAt: new Date(),
        nickName: 'Acceptance disabled',
        isEnable: false,
      },
    });
    await login(disabled).expect(403);
    expect(await prisma.authSession.count({ where: { userId: id } })).toBe(0);
  });

  it('P00-AUTH-04 concurrent verification across instances consumes once and creates one account', async () => {
    const value = await identity('concurrent-login');
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        login(value, value.code, index % 2 ? secondApp : app),
      ),
    );
    expect(results.filter((result) => result.status === 200).length).toBe(1);
    assertSingleUse(results.map((result) => result.status));
    expect(results.filter((result) => result.status === 401).length).toBe(7);
    expect(
      await prisma.userEntity.count({ where: { email: value.email } }),
    ).toBe(1);
  });

  it('P00-AUTH-04 multi-instance send cooldown ignores forged forwarding headers', async () => {
    const email = testEmail('concurrent-send');
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        request(serverOf(index % 2 ? secondApp : app))
          .post('/auth/email/code')
          .set('X-Forwarded-For', `198.51.100.${index + 1}`)
          .send({ email }),
      ),
    );
    expect(results.filter((result) => result.status === 202).length).toBe(1);
    expect(results.filter((result) => result.status === 429).length).toBe(5);
    expect(
      await prisma.emailLoginChallenge.count({
        where: { email, sendState: 'sent' },
      }),
    ).toBe(1);
    const denied = await request(serverOf(secondApp))
      .post('/auth/email/code')
      .send({ email })
      .expect(429);
    expect(Number(denied.headers['retry-after']) > 0).toBe(true);
  });

  it('P00-AUTH-05 SMTP disconnection cannot fake success; failed resend preserves old valid code', async () => {
    const freshEmail = testEmail('smtp-fresh-fail');
    const failed = await request(serverOf(brokenSmtpApp))
      .post('/auth/email/code')
      .send({ email: freshEmail })
      .expect(503);
    expect(body(failed).errCode).toBe(503);
    expect(
      'data' in body(failed) && Boolean(body(failed).data?.challengeId),
    ).toBe(false);
    expect(
      await prisma.emailLoginChallenge.count({
        where: { email: freshEmail, sendState: 'sent' },
      }),
    ).toBe(0);
    const original = await identity('smtp-resend-fail');
    const wrong = original.code === '000000' ? '000001' : '000000';
    await login(original, wrong).expect(401);
    await prisma.authEmailState.update({
      where: { email: original.email },
      data: { lastRequestedAt: new Date(Date.now() - 61000) },
    });
    await request(serverOf(brokenSmtpApp))
      .post('/auth/email/code')
      .send({ email: original.email })
      .expect(503);
    const state = await prisma.authEmailState.findUniqueOrThrow({
      where: { email: original.email },
    });
    expect(state.activeChallengeId).toBe(original.challenge.challengeId);
    expect(state.pendingChallengeId).toBeNull();
    const preserved = await prisma.emailLoginChallenge.findUniqueOrThrow({
      where: { id: original.challenge.challengeId },
    });
    expect(preserved.attempts).toBe(1);
    expect(preserved.sendState).toBe('sent');
    expect(preserved.consumedAt).toBeNull();
    const uncertain = await prisma.emailLoginChallenge.findMany({
      where: {
        email: original.email,
        id: { not: original.challenge.challengeId },
      },
    });
    expect(uncertain).toHaveLength(1);
    expect(uncertain[0].sendState).toBe('delivery_unknown');
    await login(original).expect(200);
  });

  it('P00-AUTH-03 successful resend invalidates previous challenge without bypassing expiry', async () => {
    const old = await identity('resend-success');
    await prisma.authEmailState.update({
      where: { email: old.email },
      data: { lastRequestedAt: new Date(Date.now() - 61000) },
    });
    const next = await challenge(old.email);
    expect(next.challengeId === old.challenge.challengeId).toBe(false);
    await login(old).expect(401);
    const latestCode = await readCode(old.email);
    await login({ email: old.email, code: latestCode, challenge: next }).expect(
      200,
    );
  });

  it('P00-AUTH-06 refresh rotates, replay revokes family and logout immediately revokes access', async () => {
    const value = await identity('refresh-replay');
    const signedIn = await login(value).expect(200);
    const oldCookie = refreshCookie(signedIn);
    const refreshed = await request(serverOf(app))
      .post('/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', oldCookie)
      .send({})
      .expect(200);
    const newCookie = refreshCookie(refreshed);
    expect(oldCookie === newCookie).toBe(false);
    expect('refreshToken' in body(refreshed).data).toBe(false);
    await request(serverOf(secondApp))
      .post('/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', oldCookie)
      .send({})
      .expect(401);
    await request(serverOf(app))
      .get('/auth/me')
      .set('Authorization', `Bearer ${body(refreshed).data.accessToken}`)
      .expect(401);
    await request(serverOf(app))
      .post('/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', newCookie)
      .send({})
      .expect(401);
    const logoutIdentity = await identity('logout');
    const logoutLogin = await login(logoutIdentity).expect(200);
    await request(serverOf(app))
      .post('/auth/logout')
      .set('Origin', origin)
      .set('Cookie', refreshCookie(logoutLogin))
      .send({})
      .expect(204);
    await request(serverOf(app))
      .get('/auth/me')
      .set('Authorization', `Bearer ${body(logoutLogin).data.accessToken}`)
      .expect(401);
  });

  it('P00-AUTH-06 concurrent refresh across replicas revokes only the replayed family', async () => {
    const initial = await identity('refresh-concurrent');
    const signedIn = await login(initial).expect(200);
    // A fresh code for the same user creates an independent login family.
    await prisma.authEmailState.update({
      where: { email: initial.email },
      data: { lastRequestedAt: new Date(Date.now() - 61000) },
    });
    const independentChallenge = await challenge(initial.email);
    const independent = await login({
      email: initial.email,
      challenge: independentChallenge,
      code: await readCode(initial.email),
    }).expect(200);
    const oldCookie = refreshCookie(signedIn);
    const responses = await Promise.all(
      [app, secondApp].map((target) =>
        request(serverOf(target))
          .post('/auth/refresh')
          .set('Origin', origin)
          .set('Cookie', oldCookie)
          .send({}),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 401,
    ]);
    const winner = responses.find((response) => response.status === 200)!;
    await request(serverOf(app))
      .get('/auth/me')
      .set('Authorization', `Bearer ${body(winner).data.accessToken}`)
      .expect(401);
    await request(serverOf(app))
      .post('/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', refreshCookie(winner))
      .send({})
      .expect(401);
    const user = await prisma.userEntity.findUniqueOrThrow({
      where: { email: initial.email },
    });
    const sessions = await prisma.authSession.findMany({
      where: { userId: user.id },
    });
    expect(sessions).toHaveLength(3);
    const families = new Map<string, typeof sessions>();
    for (const session of sessions) {
      const group = families.get(session.familyId) || [];
      group.push(session);
      families.set(session.familyId, group);
    }
    expect(families.size).toBe(2);
    const replayed = [...families.values()].find(
      (group) => group.length === 2,
    )!;
    expect(replayed.every((session) => session.revokedAt !== null)).toBe(true);
    await request(serverOf(app))
      .get('/auth/me')
      .set('Authorization', `Bearer ${body(independent).data.accessToken}`)
      .expect(200);
    await request(serverOf(secondApp))
      .post('/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', refreshCookie(independent))
      .send({})
      .expect(200);
  });

  it('P00-AUTH-06 cookie writes require allowlisted Origin; missing/hostile origins do not consume code', async () => {
    const value = await identity('csrf');
    const payload = {
      email: value.email,
      challengeId: value.challenge.challengeId,
      code: value.code,
    };
    await request(serverOf(app))
      .post('/auth/email/login')
      .send(payload)
      .expect(403);
    await request(serverOf(app))
      .post('/auth/email/login')
      .set('Origin', 'https://evil.example')
      .send(payload)
      .expect(403);
    await login(value).expect(200);
    for (const endpoint of ['/auth/refresh', '/auth/logout']) {
      await request(serverOf(app)).post(endpoint).send({}).expect(403);
      await request(serverOf(app))
        .post(endpoint)
        .set('Origin', 'https://evil.example')
        .send({})
        .expect(403);
    }
    await request(serverOf(app))
      .post('/auth/email/code')
      .set('Origin', 'https://evil.example')
      .send({ email: testEmail('csrf-send') })
      .expect(403);
  });

  it('P00-AUTH-06 old login and refresh are Gone, legacy JWTs cannot bypass; ids/owners retained', async () => {
    const id = BigInt(`0x${randomBytes(7).toString('hex')}`);
    legacyIds.push(id);
    const phone = `19${randomBytes(5).toString('hex')}`;
    await prisma.userEntity.create({
      data: {
        id,
        phoneNumber: phone,
        passwordHash: 'legacy-fixture-hash',
        passwordSalt: 'legacy-fixture-salt',
        nickName: 'Legacy ownership fixture',
      },
    });
    await prisma.flowEntity.create({
      data: { id, ownerUserId: id, displayName: 'Legacy ownership acceptance' },
    });
    await request(serverOf(app))
      .post('/UserAccount/RegistOrLogin')
      .send({ phoneNumber: phone, password: 'anything' })
      .expect(410);
    await request(serverOf(app))
      .post('/UserAccount/RefreshToken')
      .send({ userId: String(id), refreshTokenStr: 'anything' })
      .expect(410);
    const legacyToken = new JwtService({
      secret: process.env.JWT_SECRET || 'default-secret',
    }).sign({ sub: String(id), userId: String(id), phoneNumber: phone });
    await request(serverOf(app))
      .get('/auth/me')
      .set('Authorization', `Bearer ${legacyToken}`)
      .expect(401);
    const old = await prisma.userEntity.findUniqueOrThrow({ where: { id } });
    const oldFormatWithNewKey = new JwtService({
      secret: process.env.AUTH_JWT_SECRET,
    }).sign(
      { sub: String(id), userId: String(id), phoneNumber: phone },
      { issuer: 'nexusflow-email-auth', audience: 'nexusflow-api' },
    );
    await request(serverOf(app))
      .get('/auth/me')
      .set('Authorization', `Bearer ${oldFormatWithNewKey}`)
      .expect(401);
    expect(old.email).toBeNull();
    expect(old.phoneNumber).toBe(phone);
    expect(
      (await prisma.flowEntity.findUniqueOrThrow({ where: { id } }))
        .ownerUserId,
    ).toBe(id);
    await request(serverOf(app))
      .get('/UserAccount/GetUserById')
      .query({ userId: String(id) })
      .expect(401);
    await request(serverOf(app)).get('/UserAccount/GetUsers').expect(401);
  });

  it('P00-AUTH-07 security assertion negative-control detects insecure single-use and public DTOs', () => {
    const assertSingleUse = (statuses: number[]) =>
      expect(statuses.filter((status) => status === 200).length).toBe(1);
    expect(() => assertSingleUse([200, 200])).toThrow();
    expect(() =>
      assertPublicUser({
        id: '1',
        email: 'fixture@nexus.test',
        nickName: 'fixture',
        role: 1,
        passwordHash: 'not-a-secret-fixture',
      }),
    ).toThrow();
  });

  it('P00-AUTH-05 missing signing/pepper/SMTP configuration fails closed, not console fallback', () => {
    const configFor = (changes: Record<string, string | undefined>) => {
      // Empty values prevent ConfigService falling back to process.env for a deliberately missing setting.
      const missing = Object.fromEntries(
        Object.entries(changes).map(([key, value]) => [key, value ?? '']),
      );
      const source = new ConfigService({ ...process.env, ...missing });
      return new AuthConfig(source);
    };
    for (const required of [
      'AUTH_JWT_SECRET',
      'AUTH_EMAIL_CODE_PEPPER',
      'AUTH_ALLOWED_ORIGINS',
      'REDIS_URL',
    ]) {
      expect(() => configFor({ [required]: undefined })).toThrow();
    }
    expect(() =>
      configFor({ AUTH_JWT_SECRET: process.env.JWT_SECRET }),
    ).toThrow();
    expect(() =>
      configFor({ AUTH_JWT_SECRET: process.env.AUTH_EMAIL_CODE_PEPPER }),
    ).toThrow();
    expect(
      () => new MailService(configFor({ SMTP_HOST: undefined })),
    ).toThrow();
    expect(
      () => new MailService(configFor({ SMTP_FROM: undefined })),
    ).toThrow();
    expect(
      () =>
        new MailService(
          configFor({
            SMTP_FROM: 'sender@nexus.test\r\nBcc:evil@example.test',
          }),
        ),
    ).toThrow();
    expect(
      () =>
        new MailService(
          configFor({
            NODE_ENV: 'production',
            AUTH_ALLOWED_ORIGINS: 'https://nexus.test',
            SMTP_ALLOW_INSECURE: 'true',
          }),
        ),
    ).toThrow();
    expect(
      () =>
        new MailService(
          configFor({
            NODE_ENV: 'production',
            AUTH_ALLOWED_ORIGINS: 'https://nexus.test',
            SMTP_ALLOW_INSECURE: 'false',
            SMTP_USER: undefined,
            SMTP_PASSWORD: undefined,
          }),
        ),
    ).toThrow();
  });

  it('P00-AUTH-06 expired refresh session and disabled user cannot retain access', async () => {
    const expired = await identity('refresh-expired');
    const signedIn = await login(expired).expect(200);
    const user = await prisma.userEntity.findUniqueOrThrow({
      where: { email: expired.email },
    });
    await prisma.authSession.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await request(serverOf(app))
      .post('/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', refreshCookie(signedIn))
      .send({})
      .expect(401);
    await request(serverOf(app))
      .get('/auth/me')
      .set('Authorization', `Bearer ${body(signedIn).data.accessToken}`)
      .expect(401);
    const disabled = await identity('active-disabled');
    const active = await login(disabled).expect(200);
    await prisma.userEntity.update({
      where: { email: disabled.email },
      data: { isDeleted: true },
    });
    await request(serverOf(app))
      .get('/auth/me')
      .set('Authorization', `Bearer ${body(active).data.accessToken}`)
      .expect(401);
    await request(serverOf(app))
      .post('/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', refreshCookie(active))
      .send({})
      .expect(401);
  });

  it('P00-AUTH-04 IP and global budgets remain authoritative across identities and spoofed proxy headers', async () => {
    const limited = await application({
      AUTH_REDIS_PREFIX: `nf:p00:ip-limit:${prefix}:`,
      AUTH_SEND_IP_LIMIT: '2',
    });
    try {
      for (let index = 0; index < 3; index++) {
        await request(serverOf(limited))
          .post('/auth/email/code')
          .set('X-Forwarded-For', `203.0.113.${index + 1}`)
          .send({ email: testEmail(`ip-budget-${index}`) })
          .expect(index < 2 ? 202 : 429);
      }
    } finally {
      await limited.close();
    }
    const global = await application({
      AUTH_REDIS_PREFIX: `nf:p00:global-limit:${prefix}:`,
      AUTH_SEND_GLOBAL_LIMIT: '1',
    });
    try {
      await challenge(testEmail('global-budget-first'), global);
      const deniedEmail = testEmail('global-budget-denied');
      await request(serverOf(global))
        .post('/auth/email/code')
        .send({ email: deniedEmail })
        .expect(429);
      expect(
        await prisma.emailLoginChallenge.count({
          where: { email: deniedEmail },
        }),
      ).toBe(0);
    } finally {
      await global.close();
    }
  });

  it('P00-AUTH-04 Redis unavailable fails closed rather than sending unrestricted codes', async () => {
    const unavailable = await application({ REDIS_URL: 'redis://127.0.0.1:9' });
    try {
      const email = testEmail('redis-unavailable');
      await request(serverOf(unavailable))
        .post('/auth/email/code')
        .send({ email })
        .expect(503);
      expect(await prisma.emailLoginChallenge.count({ where: { email } })).toBe(
        0,
      );
    } finally {
      await unavailable.close();
    }
  });

  it('P00-AUTH-04 issuing a new challenge cannot reset the shared email verification budget', async () => {
    const limited = await application({
      AUTH_REDIS_PREFIX: `nf:p00:email-budget:${prefix}:`,
      AUTH_VERIFY_EMAIL_LIMIT: '2',
    });
    try {
      const email = testEmail('email-budget');
      const first = await challenge(email, limited);
      const oldCode = await readCode(email);
      const old = { email, challenge: first, code: oldCode };
      const wrong = oldCode === '000000' ? '000001' : '000000';
      await login(old, wrong, limited).expect(401);
      await login(old, wrong, limited).expect(401);
      await prisma.authEmailState.update({
        where: { email },
        data: { lastRequestedAt: new Date(Date.now() - 61000) },
      });
      const next = await challenge(email, limited);
      await login(
        { email, challenge: next, code: await readCode(email) },
        undefined,
        limited,
      ).expect(429);
      expect(await prisma.userEntity.count({ where: { email } })).toBe(0);
    } finally {
      await limited.close();
    }
  });

  it('P00-AUTH-05 SMTP timeout and explicit rejection never activate a usable challenge', async () => {
    for (const mode of ['timeout', 'reject'] as const) {
      const sockets = new Set<Socket>();
      const server = createServer((socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', () => undefined);
        if (mode === 'timeout') return;
        socket.write('220 acceptance SMTP\r\n');
        socket.on('data', (input) => {
          const command = input.toString('utf8').toUpperCase();
          if (command.startsWith('EHLO') || command.startsWith('HELO'))
            socket.write('250 acceptance\r\n');
          else if (command.startsWith('MAIL FROM'))
            socket.write('550 sending denied\r\n');
          else if (command.startsWith('QUIT')) socket.end('221 goodbye\r\n');
          else socket.write('550 command denied\r\n');
        });
      });
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve),
      );
      const port = (server.address() as AddressInfo).port;
      let faulty: INestApplication | undefined;
      try {
        faulty = await application({
          SMTP_PORT: String(port),
          SMTP_TIMEOUT_MS: '1000',
        });
        const email = testEmail(`smtp-${mode}`);
        await request(serverOf(faulty))
          .post('/auth/email/code')
          .send({ email })
          .expect(503);
        const state = await prisma.authEmailState.findUniqueOrThrow({
          where: { email },
        });
        expect(state.activeChallengeId).toBeNull();
        expect(
          await prisma.emailLoginChallenge.count({
            where: { email, sendState: 'sent' },
          }),
        ).toBe(0);
      } finally {
        await faulty?.close();
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    }
  });

  it('P00-AUTH-07 real malicious duplicate-consumption subprocess makes the same acceptance assertion exit nonzero', async () => {
    const target = await worker({ P00_TEST_REPEAT_CONSUMPTION: 'true' });
    try {
      const value = await identity('mutation-control');
      const statuses: number[] = [];
      for (let index = 0; index < 2; index++) {
        const response = await fetch(`${target.url}/auth/email/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin },
          body: JSON.stringify({
            email: value.email,
            challengeId: value.challenge.challengeId,
            code: value.code,
          }),
        });
        statuses.push(response.status);
      }
      expect(statuses).toEqual([200, 200]);
      const exited = new Promise<number | null>((resolveExit) =>
        target.child.once('exit', resolveExit),
      );
      target.child.send({ type: 'assert-single-use' });
      expect(await exited).toBe(2);
    } finally {
      await stopWorker(target.child);
    }
  });

  it('P00-AUTH-05 killing the real API during SMTP DATA leaves pending code unusable after restart', async () => {
    const sockets = new Set<Socket>();
    let captured!: (code: string) => void;
    const bodyReceived = new Promise<string>((resolveCode) => {
      captured = resolveCode;
    });
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => undefined);
      socket.write('220 acceptance crash SMTP\r\n');
      let buffer = '';
      let inData = false;
      socket.on('data', (input) => {
        buffer += input.toString('utf8');
        if (inData) {
          if (buffer.includes('\r\n.\r\n')) {
            const splitAt = buffer.indexOf('\r\n\r\n');
            const headers = buffer.slice(0, splitAt);
            const rawBody = buffer
              .slice(splitAt + 4)
              .replace(/\r\n\.\r\n[\s\S]*$/, '');
            const decoded = /Content-Transfer-Encoding:\s*base64/i.test(headers)
              ? Buffer.from(rawBody.replace(/\s/g, ''), 'base64').toString(
                  'utf8',
                )
              : rawBody.replace(/=\r\n/g, '');
            const code = decoded.match(/\b\d{6}\b/)?.[0];
            if (code) captured(code);
            // Deliberately never ACK; challenge remains pending until API is killed.
          }
          return;
        }
        while (buffer.includes('\r\n')) {
          const at = buffer.indexOf('\r\n');
          const line = buffer.slice(0, at).toUpperCase();
          buffer = buffer.slice(at + 2);
          if (line.startsWith('EHLO') || line.startsWith('HELO'))
            socket.write('250 acceptance\r\n');
          else if (line.startsWith('MAIL FROM') || line.startsWith('RCPT TO'))
            socket.write('250 OK\r\n');
          else if (line === 'DATA') {
            inData = true;
            socket.write('354 send body\r\n');
            break;
          } else socket.write('550 denied\r\n');
        }
      });
    });
    await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
    const target = await worker({
      SMTP_PORT: String((server.address() as AddressInfo).port),
      SMTP_TIMEOUT_MS: '30000',
    });
    let recovered: Awaited<ReturnType<typeof worker>> | undefined;
    try {
      const email = testEmail('smtp-process-kill');
      const requestFinished = fetch(`${target.url}/auth/email/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      }).catch(() => null);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const code = await Promise.race([
        bodyReceived,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(new Error('SMTP DATA was not observed in crash fixture')),
            10000,
          );
        }),
      ]).finally(() => clearTimeout(timer));
      const pending = await prisma.emailLoginChallenge.findFirstOrThrow({
        where: { email },
      });
      expect(pending.sendState).toBe('pending');
      await stopWorker(target.child);
      await requestFinished;
      recovered = await worker();
      const denied = await fetch(`${recovered.url}/auth/email/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({ email, challengeId: pending.id, code }),
      });
      expect(denied.status).toBe(401);
      expect(
        await prisma.authSession.count({ where: { user: { email } } }),
      ).toBe(0);
      await prisma.authEmailState.update({
        where: { email },
        data: { lastRequestedAt: new Date(Date.now() - 61000) },
      });
      const next = await challenge(email);
      await login({
        email,
        challenge: next,
        code: await readCode(email),
      }).expect(200);
      expect(
        (
          await prisma.emailLoginChallenge.findUniqueOrThrow({
            where: { id: pending.id },
          })
        ).sendState,
      ).not.toBe('sent');
    } finally {
      await stopWorker(target.child);
      if (recovered) await stopWorker(recovered.child);
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((closed) => server.close(() => closed()));
    }
  }, 60000);

  it('P00-AUTH-06 actual migrate deploy preserves populated pre-email user, flow and knowledge ownership', async () => {
    const name = `nexus_p00_migration_${randomBytes(8).toString('hex')}`;
    if (!/^nexus_p00_migration_[a-f0-9]{16}$/.test(name))
      throw new Error('Unsafe acceptance database identifier');
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = '/' + name;
    const fixtureUrl = url.toString();
    let created = false;
    let fixture: PrismaClient | undefined;
    try {
      await prisma.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
      created = true;
      for (const migration of [
        '20260513205145_init',
        '20260514093000_add_pgvector_for_chunks',
      ]) {
        await runPrisma(
          [
            'db',
            'execute',
            '--file',
            `prisma/migrations/${migration}/migration.sql`,
            '--url',
            fixtureUrl,
          ],
          fixtureUrl,
        );
        await runPrisma(
          ['migrate', 'resolve', '--applied', migration],
          fixtureUrl,
        );
      }
      fixture = new PrismaClient({ datasourceUrl: fixtureUrl });
      await fixture.$executeRaw`INSERT INTO "UserEntity" ("id","phoneNumber","passwordHash","passwordSalt","nickName") VALUES (700001,'18800007001','legacy-fixture-hash','legacy-fixture-salt','Legacy migration fixture')`;
      await fixture.$executeRaw`INSERT INTO "FlowEntity" ("id","ownerUserId","displayName") VALUES (700002,700001,'Migration flow fixture')`;
      await fixture.$executeRaw`INSERT INTO "KnowledgeBaseEntity" ("id","ownerUserId","name","updatedAt") VALUES (700003,700001,'Migration knowledge fixture',CURRENT_TIMESTAMP)`;
      await runPrisma(['migrate', 'deploy'], fixtureUrl);
      await runPrisma(['migrate', 'deploy'], fixtureUrl);
      const user = await fixture.userEntity.findUniqueOrThrow({
        where: { id: 700001n },
      });
      expect(user.email).toBeNull();
      expect(user.emailVerifiedAt).toBeNull();
      expect(user.phoneNumber).toBe('18800007001');
      expect(user.passwordHash === 'legacy-fixture-hash').toBe(true);
      expect(user.passwordSalt === 'legacy-fixture-salt').toBe(true);
      expect(
        (await fixture.flowEntity.findUniqueOrThrow({ where: { id: 700002n } }))
          .ownerUserId,
      ).toBe(700001n);
      expect(
        (
          await fixture.knowledgeBaseEntity.findUniqueOrThrow({
            where: { id: 700003n },
          })
        ).ownerUserId,
      ).toBe(700001n);
      expect(await fixture.authSession.count()).toBe(0);
      expect(await fixture.emailLoginChallenge.count()).toBe(0);
    } finally {
      await fixture?.$disconnect();
      // Delete only the exact randomly named database created above, never nexus_test/production.
      if (created)
        await prisma.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    }
  }, 120000);
});
