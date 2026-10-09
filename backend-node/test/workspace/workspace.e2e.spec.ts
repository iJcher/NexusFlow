import { randomBytes, randomUUID } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import type { Server } from 'node:http';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  WorkspaceService,
  INVITABLE_ROLES,
} from '../../src/workspace/workspace.service';
import { WorkspaceController } from '../../src/workspace/workspace.controller';
import { IS_PUBLIC_KEY } from '../../src/auth/public.decorator';
import { RunsRepository } from '../../src/runs/repository';
import { WorkflowCompiler } from '../../src/runs/compiler';

// Deliberately NOT a JWT test. Trusted identity is provided by this fixture guard.
class FixtureGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: { id: string; email: string | null };
    }>();
    const id = req.headers['x-fixture-user'];
    if (!id || !/^\d+$/.test(id)) throw new UnauthorizedException();
    req.user = { id, email: req.headers['x-fixture-email'] ?? null };
    return true;
  }
}
const roles = ['Owner', ...INVITABLE_ROLES];
describe('P01 Workspace real PostgreSQL and Nest HTTP contract', () => {
  const prisma = new PrismaService();
  const service = new WorkspaceService(prisma);
  let app: INestApplication;
  let server: Server;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let owner: bigint;
  let outsider: bigint;
  let recipient: bigint;
  let email: string;
  let users: bigint[];
  let workspaceIds: string[];
  let flowIds: bigint[];
  let memberByRole: Record<string, bigint>;
  // IDs are fresh positive int64 values; no production IDs or global deletes.
  function freshId() {
    return (
      (BigInt('0x' + randomBytes(8).toString('hex')) & ((1n << 62n) - 1n)) + 1n
    );
  }
  async function user(verified = true) {
    const id = freshId();
    users.push(id);
    const address = randomUUID() + '@workspace.test.invalid';
    await prisma.userEntity.create({
      data: {
        id,
        nickName: 'workspace-test',
        email: address,
        emailVerifiedAt: verified ? new Date() : null,
      },
    });
    return { id, email: address };
  }
  async function counts() {
    return {
      members: await prisma.workspaceMember.count({ where: { workspaceId } }),
      invites: await prisma.workspaceInvitation.count({
        where: { workspaceId },
      }),
      audit: await prisma.workspaceAudit.count({ where: { workspaceId } }),
    };
  }
  async function invite(role = 'Viewer') {
    return service.invite(workspaceId, owner.toString(), email, role);
  }
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (
      url.hostname !== '127.0.0.1' ||
      url.port !== '15432' ||
      url.pathname !== '/nexus_test'
    )
      throw new Error('ISOLATED_WORKSPACE_TEST_DATABASE_REQUIRED');
    await prisma.$connect();
    const module = await Test.createTestingModule({
      controllers: [WorkspaceController],
      providers: [{ provide: WorkspaceService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalGuards(new FixtureGuard());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    server = app.getHttpServer() as Server;
  });
  beforeEach(async () => {
    users = [];
    workspaceIds = [];
    flowIds = [];
    memberByRole = {};
    owner = (await user()).id;
    outsider = (await user()).id;
    const target = await user();
    recipient = target.id;
    email = target.email;
    workspaceId = (await service.ensurePrivate(owner.toString())).id;
    otherWorkspaceId = (await service.ensurePrivate(outsider.toString())).id;
    workspaceIds.push(workspaceId, otherWorkspaceId);
    memberByRole.Owner = owner;
    for (const role of INVITABLE_ROLES) {
      const id = (await user()).id;
      memberByRole[role] = id;
      await prisma.workspaceMember.create({
        data: { workspaceId, userId: id, role },
      });
    }
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    const runIds = (
      await prisma.flowRun.findMany({
        where: { workspaceId: { in: workspaceIds } },
        select: { id: true },
      })
    ).map((row) => row.id);
    const nodeIds = (
      await prisma.nodeRun.findMany({
        where: { runId: { in: runIds } },
        select: { id: true },
      })
    ).map((row) => row.id);
    await prisma.externalOperation.deleteMany({
      where: { runId: { in: runIds } },
    });
    await prisma.nodeAttempt.deleteMany({
      where: { nodeRunId: { in: nodeIds } },
    });
    await prisma.runOutbox.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.runEvent.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.runEdge.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.nodeRun.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.flowRun.deleteMany({ where: { id: { in: runIds } } });
    await prisma.workflowVersion.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.flowEntity.deleteMany({ where: { id: { in: flowIds } } });
    await prisma.workspaceAudit.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.workspaceInvitation.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.workspaceMember.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await prisma.userEntity.deleteMany({ where: { id: { in: users } } });
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  function simpleGraph() {
    const schema = { type: 'object', additionalProperties: true };
    return {
      schemaVersion: 1,
      inputSchema: schema,
      nodes: [
        {
          id: 'start',
          kind: 'start',
          inputSchema: schema,
          outputSchema: schema,
          inputBindings: {},
        },
      ],
      edges: [],
    };
  }
  async function flow(userId: bigint) {
    const id = freshId();
    flowIds.push(id);
    await prisma.flowEntity.create({
      data: { id, ownerUserId: userId, displayName: 'workspace-test' },
    });
    return id;
  }
  it('private creation and publishing two different flows concurrently share one identity lock and workspace', async () => {
    const id = (await user()).id;
    const first = await flow(id);
    const second = await flow(id);
    const runs = new RunsRepository(prisma, new WorkflowCompiler());
    const results = await Promise.allSettled([
      service.ensurePrivate(id.toString()),
      runs.publish(first, id.toString(), simpleGraph()),
      runs.publish(second, id.toString(), simpleGraph()),
    ]);
    const spaces = await prisma.workspace.findMany({
      where: { ownerUserId: id },
    });
    workspaceIds.push(...spaces.map((row) => row.id));
    expect(results.every((row) => row.status === 'fulfilled')).toBe(true);
    expect(spaces).toHaveLength(1);
    expect(
      await prisma.workspaceMember.count({
        where: { workspaceId: spaces[0].id, userId: id, role: 'Owner' },
      }),
    ).toBe(1);
    expect(
      await prisma.workflowVersion.count({
        where: { workspaceId: spaces[0].id },
      }),
    ).toBe(2);
    expect(await prisma.userEntity.findUnique({ where: { id } })).toMatchObject(
      { id },
    );
  });
  it('member downgrade and removal immediately affect existing runs and execution authorization', async () => {
    const runs = new RunsRepository(prisma, new WorkflowCompiler());
    const version = await runs.publish(
      await flow(owner),
      owner.toString(),
      simpleGraph(),
    );
    const id = memberByRole.Operator.toString();
    const run = await runs.create(version.id, id, {});
    await expect(runs.snapshot(run.runId, id)).resolves.toMatchObject({
      id: run.runId,
    });
    await service.changeMember(workspaceId, id, owner.toString(), 'Viewer');
    const count = await prisma.flowRun.count({ where: { workspaceId } });
    await expect(runs.create(version.id, id, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(await prisma.flowRun.count({ where: { workspaceId } })).toBe(count);
    await expect(runs.snapshot(run.runId, id)).resolves.toMatchObject({
      id: run.runId,
    });
    await service.changeMember(workspaceId, id, owner.toString());
    await expect(runs.snapshot(run.runId, id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(runs.create(version.id, id, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('reentrant and concurrent private creation preserves user and ownership, one workspace/member/audit', async () => {
    const before = await prisma.userEntity.findUniqueOrThrow({
      where: { id: owner },
    });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => service.ensurePrivate(owner.toString())),
    );
    expect(new Set(results.map((r) => r.id))).toEqual(new Set([workspaceId]));
    expect(
      await prisma.workspace.count({ where: { ownerUserId: owner } }),
    ).toBe(1);
    expect(
      await prisma.workspaceMember.count({
        where: { workspaceId, userId: owner, role: 'Owner' },
      }),
    ).toBe(1);
    expect(
      await prisma.workspaceAudit.count({
        where: { workspaceId, action: 'workspace.created' },
      }),
    ).toBe(1);
    expect(
      await prisma.userEntity.findUnique({ where: { id: owner } }),
    ).toEqual(before);
  });
  it('concurrent first creation produces exactly one workspace', async () => {
    const id = (await user()).id;
    const rows = await Promise.all(
      Array.from({ length: 8 }, () => service.ensurePrivate(id.toString())),
    );
    workspaceIds.push(rows[0].id);
    expect(new Set(rows.map((r) => r.id)).size).toBe(1);
    expect(await prisma.workspace.count({ where: { ownerUserId: id } })).toBe(
      1,
    );
    expect(
      await prisma.workspaceAudit.count({ where: { workspaceId: rows[0].id } }),
    ).toBe(1);
  });
  it.each(roles)(
    'invitation authorization role %s (only Owner succeeds)',
    async (role) => {
      const before = await counts();
      const result = await request(server)
        .post(`/workspaces/${workspaceId}/invitations`)
        .set('x-fixture-user', memberByRole[role].toString())
        .send({ email, role: 'Viewer' });
      expect(result.status).toBe(role === 'Owner' ? 201 : 403);
      expect(await counts()).toEqual(
        role === 'Owner'
          ? { ...before, invites: before.invites + 1, audit: before.audit + 1 }
          : before,
      );
    },
  );
  it.each(INVITABLE_ROLES)(
    'Owner can invite and accept role %s',
    async (role) => {
      const invitation = await invite(role);
      expect(await service.accept(invitation.id, recipient.toString())).toEqual(
        { workspaceId, role },
      );
      expect(
        await prisma.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: recipient } },
        }),
      ).toMatchObject({ role });
    },
  );
  it.each(['Owner', 'admin', '', 'viewer', 'Owner '])(
    'rejects invalid invitation role %s without mutation',
    async (role) => {
      const before = await counts();
      await request(server)
        .post(`/workspaces/${workspaceId}/invitations`)
        .set('x-fixture-user', owner.toString())
        .send({ email, role })
        .expect(400);
      expect(await counts()).toEqual(before);
    },
  );
  it.each(['bad', 'a@b', '', 'x'.repeat(255) + '@example.com'])(
    'rejects malformed invitation email case %#',
    async (badEmail) => {
      const before = await counts();
      await request(server)
        .post(`/workspaces/${workspaceId}/invitations`)
        .set('x-fixture-user', owner.toString())
        .send({ email: badEmail, role: 'Viewer' })
        .expect(400);
      expect(await counts()).toEqual(before);
    },
  );
  it('normalizes stored email, rejects self and duplicate invitations with zero mutation', async () => {
    const ownEmail = (
      await prisma.userEntity.findUniqueOrThrow({ where: { id: owner } })
    ).email!;
    const before = await counts();
    await expect(
      service.invite(
        workspaceId,
        owner.toString(),
        ownEmail.toUpperCase(),
        'Viewer',
      ),
    ).rejects.toThrow('SELF_INVITATION');
    expect(await counts()).toEqual(before);
    const invitation = await service.invite(
      workspaceId,
      owner.toString(),
      '  ' + email.toUpperCase() + '  ',
      'Viewer',
    );
    expect(
      await prisma.workspaceInvitation.findUnique({
        where: { id: invitation.id },
      }),
    ).toMatchObject({ email });
    const after = await counts();
    await expect(invite()).rejects.toThrow('INVITATION_PENDING');
    expect(await counts()).toEqual(after);
  });
  it('outsider cannot invite into another workspace', async () => {
    const before = await counts();
    await request(server)
      .post(`/workspaces/${workspaceId}/invitations`)
      .set('x-fixture-user', outsider.toString())
      .send({ email, role: 'Viewer' })
      .expect(403);
    expect(await counts()).toEqual(before);
  });
  it('verified DB email governs accept, not request user email', async () => {
    const invitation = await invite();
    const before = await counts();
    await request(server)
      .post(`/workspaces/invitations/${invitation.id}/accept`)
      .set('x-fixture-user', outsider.toString())
      .set('x-fixture-email', email)
      .send({})
      .expect(403);
    expect(await counts()).toEqual(before);
    await request(server)
      .post(`/workspaces/invitations/${invitation.id}/accept`)
      .set('x-fixture-user', recipient.toString())
      .set('x-fixture-email', 'wrong@example.com')
      .send({})
      .expect(201);
  });
  it('unverified DB email cannot accept even when request claims matching email', async () => {
    const invitation = await invite();
    await prisma.userEntity.update({
      where: { id: recipient },
      data: { emailVerifiedAt: null },
    });
    const before = await counts();
    await request(server)
      .post(`/workspaces/invitations/${invitation.id}/accept`)
      .set('x-fixture-user', recipient.toString())
      .set('x-fixture-email', email)
      .send({})
      .expect(403);
    expect(await counts()).toEqual(before);
    expect(
      await prisma.workspaceInvitation.findUnique({
        where: { id: invitation.id },
      }),
    ).toMatchObject({ acceptedAt: null });
  });
  it('accept rejects request identity and role fields without membership or invitation mutation', async () => {
    const invitation = await invite();
    const before = await counts();
    await request(server)
      .post(`/workspaces/invitations/${invitation.id}/accept`)
      .set('x-fixture-user', recipient.toString())
      .send({ userId: owner.toString(), role: 'Owner' })
      .expect(400);
    expect(await counts()).toEqual(before);
    expect(
      await prisma.workspaceInvitation.findUnique({
        where: { id: invitation.id },
      }),
    ).toMatchObject({ acceptedAt: null, acceptedBy: null });
    await request(server)
      .post(`/workspaces/invitations/${invitation.id}/accept`)
      .set('x-fixture-user', recipient.toString())
      .send({})
      .expect(201);
  });
  it('parallel acceptance has exactly one success, one member and one acceptance audit', async () => {
    const invitation = await invite();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(server)
          .post(`/workspaces/invitations/${invitation.id}/accept`)
          .set('x-fixture-user', recipient.toString())
          .send({}),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    expect(
      await prisma.workspaceMember.count({
        where: { workspaceId, userId: recipient },
      }),
    ).toBe(1);
    expect(
      await prisma.workspaceAudit.count({
        where: {
          workspaceId,
          action: 'invitation.accepted',
          targetId: invitation.id,
        },
      }),
    ).toBe(1);
  });
  it.each(['expired', 'revoked'])(
    '%s invitation is unavailable with zero acceptance mutation',
    async (state) => {
      const invitation = await invite();
      if (state === 'expired')
        await prisma.workspaceInvitation.update({
          where: { id: invitation.id },
          data: { expiresAt: new Date(0) },
        });
      else await service.revoke(workspaceId, invitation.id, owner.toString());
      const before = await counts();
      await request(server)
        .post(`/workspaces/invitations/${invitation.id}/accept`)
        .set('x-fixture-user', recipient.toString())
        .send({})
        .expect(409);
      expect(await counts()).toEqual(before);
      expect(
        await prisma.workspaceInvitation.findUnique({
          where: { id: invitation.id },
        }),
      ).toMatchObject({ acceptedAt: null });
    },
  );
  it('cannot overwrite an existing member through an invitation', async () => {
    await prisma.workspaceMember.create({
      data: { workspaceId, userId: recipient, role: 'Viewer' },
    });
    const invitation = await invite('Operator');
    const before = await counts();
    await expect(
      service.accept(invitation.id, recipient.toString()),
    ).rejects.toThrow('ALREADY_MEMBER');
    expect(await counts()).toEqual(before);
    expect(
      await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: recipient } },
      }),
    ).toMatchObject({ role: 'Viewer' });
  });
  it('cross-workspace revoke cannot affect the target invitation', async () => {
    const invitation = await invite();
    const before = await counts();
    await request(server)
      .delete(`/workspaces/${otherWorkspaceId}/invitations/${invitation.id}`)
      .set('x-fixture-user', outsider.toString())
      .expect(404);
    expect(await counts()).toEqual(before);
    expect(
      await prisma.workspaceInvitation.findUnique({
        where: { id: invitation.id },
      }),
    ).toMatchObject({ revokedAt: null });
  });
  it.each(INVITABLE_ROLES)('Owner cannot be demoted to %s', async (role) => {
    const before = await counts();
    await request(server)
      .patch(`/workspaces/${workspaceId}/members/${owner}`)
      .set('x-fixture-user', owner.toString())
      .send({ role })
      .expect(409);
    expect(await counts()).toEqual(before);
  });
  it('Owner cannot be removed', async () => {
    const before = await counts();
    await request(server)
      .delete(`/workspaces/${workspaceId}/members/${owner}`)
      .set('x-fixture-user', owner.toString())
      .expect(409);
    expect(await counts()).toEqual(before);
  });
  it.each(INVITABLE_ROLES)(
    'non-owner %s cannot modify or remove a member, revoke, or list members',
    async (role) => {
      const id = memberByRole[role].toString();
      const invitation = await invite();
      const before = await counts();
      await request(server)
        .patch(`/workspaces/${workspaceId}/members/${recipient}`)
        .set('x-fixture-user', id)
        .send({ role: 'Editor' })
        .expect(403);
      await request(server)
        .delete(`/workspaces/${workspaceId}/members/${recipient}`)
        .set('x-fixture-user', id)
        .expect(403);
      await request(server)
        .delete(`/workspaces/${workspaceId}/invitations/${invitation.id}`)
        .set('x-fixture-user', id)
        .expect(403);
      await request(server)
        .get(`/workspaces/${workspaceId}/members`)
        .set('x-fixture-user', id)
        .expect(403);
      expect(await counts()).toEqual(before);
    },
  );
  it('Owner changes and removes a member with one audit per operation', async () => {
    const id = memberByRole.Operator;
    await request(server)
      .patch(`/workspaces/${workspaceId}/members/${id}`)
      .set('x-fixture-user', owner.toString())
      .send({ role: 'Viewer' })
      .expect(200);
    expect(await service.list(id.toString())).toEqual([
      { workspaceId, role: 'Viewer', workspace: { name: 'Private workspace' } },
    ]);
    await request(server)
      .delete(`/workspaces/${workspaceId}/members/${id}`)
      .set('x-fixture-user', owner.toString())
      .expect(200);
    expect(await service.list(id.toString())).toEqual([]);
    expect(
      await prisma.workspaceAudit.count({
        where: {
          workspaceId,
          targetId: id.toString(),
          action: { in: ['member.role_changed', 'member.removed'] },
        },
      }),
    ).toBe(2);
  });
  it.each(['0', '-1', '01', 'abc', '9223372036854775808'])(
    'invalid member identifier %s rejected before mutation',
    async (id) => {
      const before = await counts();
      await request(server)
        .delete(`/workspaces/${workspaceId}/members/${id}`)
        .set('x-fixture-user', owner.toString())
        .expect(400);
      expect(await counts()).toEqual(before);
    },
  );
  it('rejects malformed UUID and forbidden DTO fields', async () => {
    const before = await counts();
    await request(server)
      .post('/workspaces/not-a-uuid/invitations')
      .set('x-fixture-user', owner.toString())
      .send({ email, role: 'Viewer' })
      .expect(400);
    await request(server)
      .post(`/workspaces/${workspaceId}/invitations`)
      .set('x-fixture-user', owner.toString())
      .send({ email, role: 'Viewer', ownerUserId: outsider.toString() })
      .expect(400);
    expect(await counts()).toEqual(before);
  });
  it.each(['disabled', 'deleted', 'locked'])(
    'inactive %s DB user cannot accept/create/list',
    async (state) => {
      const invitation = await invite();
      const data: Prisma.UserEntityUpdateInput =
        state === 'disabled'
          ? { isEnable: false }
          : state === 'deleted'
            ? { isDeleted: true }
            : {
                lockoutEnabled: true,
                lockoutEndDateUtc: new Date(Date.now() + 3600000),
              };
      await prisma.userEntity.update({ where: { id: recipient }, data });
      const before = await counts();
      await expect(
        service.accept(invitation.id, recipient.toString()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.ensurePrivate(recipient.toString()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.list(recipient.toString())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(await counts()).toEqual(before);
      expect(
        await prisma.workspace.count({ where: { ownerUserId: recipient } }),
      ).toBe(0);
    },
  );
  it.each(['invite', 'accept', 'revoke', 'change', 'remove', 'create'])(
    'audit failure rolls back %s operation and all SQL mutations',
    async (action) => {
      let invitation: { id: string } | undefined;
      if (action === 'accept' || action === 'revoke')
        invitation = await invite();
      const before = await counts();
      const audit = jest
        .spyOn(service as unknown as { audit: () => Promise<unknown> }, 'audit')
        .mockRejectedValue(new Error('TEST_AUDIT_FAILURE'));
      const operation =
        action === 'invite'
          ? invite()
          : action === 'accept'
            ? service.accept(invitation!.id, recipient.toString())
            : action === 'revoke'
              ? service.revoke(workspaceId, invitation!.id, owner.toString())
              : action === 'change'
                ? service.changeMember(
                    workspaceId,
                    memberByRole.Operator.toString(),
                    owner.toString(),
                    'Viewer',
                  )
                : action === 'remove'
                  ? service.changeMember(
                      workspaceId,
                      memberByRole.Operator.toString(),
                      owner.toString(),
                    )
                  : service.ensurePrivate(recipient.toString());
      await expect(operation).rejects.toThrow('TEST_AUDIT_FAILURE');
      audit.mockRestore();
      expect(await counts()).toEqual(before);
      expect(
        await prisma.workspaceMember.findUnique({
          where: {
            workspaceId_userId: { workspaceId, userId: memberByRole.Operator },
          },
        }),
      ).toMatchObject({ role: 'Operator' });
      if (invitation)
        expect(
          await prisma.workspaceInvitation.findUnique({
            where: { id: invitation.id },
          }),
        ).toMatchObject({ acceptedAt: null, revokedAt: null });
      expect(
        await prisma.workspace.count({ where: { ownerUserId: recipient } }),
      ).toBe(0);
    },
  );
  it('audit schema contains only identifiers and action, never email or secrets', async () => {
    const invitation = await invite();
    await service.accept(invitation.id, recipient.toString());
    const rows = await prisma.workspaceAudit.findMany({
      where: { workspaceId },
    });
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        'action',
        'actorUserId',
        'createdAt',
        'id',
        'role',
        'targetId',
        'workspaceId',
      ]);
      expect(
        JSON.stringify(row, (_key, value: unknown) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      ).not.toContain(email);
    }
  });
  it('negative control: bypassing Owner authorization makes the unchanged forbidden invariant red', async () => {
    const invariant = async () => {
      await expect(
        service.invite(workspaceId, outsider.toString(), email, 'Viewer'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    };
    await invariant();
    const fake = await prisma.userEntity.findUniqueOrThrow({
      where: { id: outsider },
    });
    const bypass = jest
      .spyOn(
        service as unknown as {
          owner: () => Promise<{ user: typeof fake; now: Date }>;
        },
        'owner',
      )
      .mockResolvedValue({ user: fake, now: new Date() });
    try {
      await expect(invariant()).rejects.toThrow();
    } finally {
      bypass.mockRestore();
    }
    await invariant();
  });
  it('no Workspace endpoint is marked Public', () => {
    const reflector = new Reflector();
    for (const name of Object.getOwnPropertyNames(
      WorkspaceController.prototype,
    ).filter((name) => name !== 'constructor')) {
      const handler: unknown = Object.getOwnPropertyDescriptor(
        WorkspaceController.prototype,
        name,
      )?.value;
      expect(typeof handler).toBe('function');
      expect(
        reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
          handler as (...args: unknown[]) => unknown,
          WorkspaceController,
        ]),
      ).not.toBe(true);
    }
  });
  it.each([
    ['get', '/workspaces'],
    ['post', '/workspaces/private'],
    ['get', '/workspaces/:id/members'],
    ['post', '/workspaces/:id/invitations'],
    ['post', '/workspaces/invitations/:inv/accept'],
    ['delete', '/workspaces/:id/invitations/:inv'],
    ['patch', '/workspaces/:id/members/:member'],
    ['delete', '/workspaces/:id/members/:member'],
  ])('anonymous %s %s rejected before SQL mutation', async (method, route) => {
    const before = await counts();
    const url = route
      .replace(':id', workspaceId)
      .replace(':inv', randomUUID())
      .replace(':member', recipient.toString());
    const agent = request(server);
    const call =
      method === 'get'
        ? agent.get(url)
        : method === 'post'
          ? agent.post(url)
          : method === 'patch'
            ? agent.patch(url)
            : agent.delete(url);
    await call.send({ email, role: 'Viewer' }).expect(401);
    expect(await counts()).toEqual(before);
  });
});
