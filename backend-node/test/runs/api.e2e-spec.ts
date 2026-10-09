import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../src/prisma/prisma.service';
import { WorkflowCompiler } from '../../src/runs/compiler';
import { ExecutionError, JsonObject } from '../../src/runs/contracts';
import { RunsRepository } from '../../src/runs/repository';
import {
  RunsController,
  VersionsController,
} from '../../src/runs/runs.controller';
import { chain, isolated, node, testIdentity } from './fixtures';

// Authentication transport is deliberately not mocked as a production guarantee:
// only this loopback test app injects fixture identities. Authorization, controllers,
// DTO pipes, HTTP statuses and durable PostgreSQL state are real.
describe('P02 real HTTP workspace role authorization', () => {
  const roles = ['Owner', 'Editor', 'Operator', 'Approver', 'Viewer'] as const;
  const identities = roles.map(() => testIdentity());
  const outsider = testIdentity();
  const owner = identities[0];
  const flowId = owner.id + 1n;
  let prisma: PrismaService;
  let repo: RunsRepository;
  let app: INestApplication;
  let base: string;
  let versionId: string;
  let runId: string;
  let operationId: string;
  const originalBigIntJson = Object.getOwnPropertyDescriptor(
    BigInt.prototype,
    'toJSON',
  );

  beforeAll(async () => {
    isolated();
    Object.defineProperty(BigInt.prototype, 'toJSON', {
      configurable: true,
      writable: true,
      value: function (this: bigint) {
        return this.toString();
      },
    });
    prisma = new PrismaService();
    await prisma.$connect();
    repo = new RunsRepository(prisma, new WorkflowCompiler());
    await prisma.userEntity.createMany({
      data: [...identities, outsider].map((identity) => ({
        id: identity.id,
        nickName: identity.name,
        email: identity.name + '@nexus.test',
      })),
    });
    await prisma.flowEntity.create({
      data: {
        id: flowId,
        ownerUserId: owner.id,
        displayName: owner.name,
      },
    });
    const version = await repo.publish(
      flowId,
      owner.id.toString(),
      chain(
        node('start', 'start'),
        node('write', 'http', {
          config: { url: 'https://fixture.nexus.test/write', method: 'POST' },
        }),
      ),
    );
    versionId = version.id;
    await prisma.workspaceMember.createMany({
      data: roles.slice(1).map((role, index) => ({
        workspaceId: version.workspaceId,
        role,
        userId: identities[index + 1].id,
      })),
    });
    runId = (await repo.create(version.id, owner.id.toString(), {})).runId;
    const start = await repo.claim(runId, 'start', 'api-fixture');
    expect(start).not.toBeNull();
    await repo.complete(start!, {});
    const write = await repo.claim(runId, 'write', 'api-fixture');
    expect(write).not.toBeNull();
    await repo.fail(write!, new ExecutionError('LOST_RESPONSE', false, true));
    operationId = (await repo.snapshot(runId, owner.id.toString()))
      .operations[0].id;
    const module = await Test.createTestingModule({
      controllers: [RunsController, VersionsController],
      providers: [{ provide: RunsRepository, useValue: repo }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.use(
      (
        request: Request & { user?: { id: string } },
        response: Response,
        next: NextFunction,
      ) => {
        const id = request.header('x-acceptance-user');
        if (
          !id ||
          ![...identities, outsider].some(
            (identity) => identity.id.toString() === id,
          )
        ) {
          response.sendStatus(401);
          return;
        }
        request.user = { id };
        next();
      },
    );
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (originalBigIntJson)
      Object.defineProperty(BigInt.prototype, 'toJSON', originalBigIntJson);
    else Reflect.deleteProperty(BigInt.prototype, 'toJSON');
  });
  async function http(
    index: number,
    path: string,
    method = 'GET',
    body?: unknown,
  ) {
    return fetch(base + path, {
      method,
      headers: {
        'x-acceptance-user': (identities[index] || outsider).id.toString(),
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  test.each(roles.map((role, index) => [role, index] as const))(
    'P02-09 HTTP %s can read snapshot and ordered events; only Owner/Operator create/cancel',
    async (_role, index) => {
      expect((await http(index, '/runs/' + runId)).status).toBe(200);
      const eventResponse = await http(
        index,
        '/runs/' + runId + '/events?after=0',
      );
      expect(eventResponse.status).toBe(200);
      const eventBody = (await eventResponse.json()) as {
        events: { seq: number }[];
        highWaterSeq: number;
      };
      expect(Array.isArray(eventBody.events)).toBe(true);
      expect(eventBody.events.map((event) => event.seq)).toEqual(
        Array.from(
          { length: eventBody.highWaterSeq },
          (_, sequence) => sequence + 1,
        ),
      );
      const allowed = index === 0 || index === 2;
      const creation = await http(index, '/runs', 'POST', {
        versionId,
        input: {},
      });
      expect(creation.status).toBe(allowed ? 202 : 403);
      if (allowed) {
        const created = (await creation.json()) as JsonObject;
        expect(typeof created.runId).toBe('string');
        if (typeof created.runId !== 'string')
          throw new Error('Invalid HTTP runId');
        expect(
          (await http(index, '/runs/' + created.runId + '/cancel', 'POST'))
            .status,
        ).toBe(202);
      }
      const cancellation = await http(
        index,
        '/runs/' + runId + '/cancel',
        'POST',
      );
      expect(cancellation.status).toBe(allowed ? 202 : 403);
    },
  );
  test.each([1, 2, 3, 4, 5])(
    'P02-07 HTTP non-owner %i cannot resolve an uncertain external write',
    async (index) => {
      const response = await http(
        index,
        '/runs/' + runId + '/operations/' + operationId + '/resolve',
        'POST',
        {
          decision: 'succeeded',
          reason: 'Verified external request log',
          output: {},
        },
      );
      expect(response.status).toBe(403);
      expect(
        (await repo.snapshot(runId, owner.id.toString())).operations[0].status,
      ).toBe('unknown');
    },
  );
  test('P02-09 HTTP outsider cannot read events/snapshot/create/cancel or disable', async () => {
    for (const path of ['/runs/' + runId, '/runs/' + runId + '/events']) {
      expect((await http(5, path)).status).toBe(403);
    }
    expect(
      (await http(5, '/runs', 'POST', { versionId, input: {} })).status,
    ).toBe(403);
    expect((await http(5, '/runs/' + runId + '/cancel', 'POST')).status).toBe(
      403,
    );
    expect(
      (await http(5, '/workflows/versions/' + versionId + '/disable', 'POST'))
        .status,
    ).toBe(403);
  });
  test.each(roles.map((role, index) => [role, index] as const))(
    'P02-09 HTTP %s can disable versions only as Owner/Editor',
    async (_role, index) => {
      const fresh = await repo.publish(
        flowId,
        owner.id.toString(),
        chain(node('start', 'start')),
      );
      const allowed = index === 0 || index === 1;
      expect(
        (
          await http(
            index,
            '/workflows/versions/' + fresh.id + '/disable',
            'POST',
          )
        ).status,
      ).toBe(allowed ? 201 : 403);
      const state = await prisma.workflowVersion.findUniqueOrThrow({
        where: { id: fresh.id },
      });
      expect(state.disabledAt !== null).toBe(allowed);
    },
  );
  test('P02-07 HTTP Owner resolves a separate unknown operation using verified output', async () => {
    const fresh = (await repo.create(versionId, owner.id.toString(), {})).runId;
    const start = await repo.claim(fresh, 'start', 'api-owner-fixture');
    expect(start).not.toBeNull();
    await repo.complete(start!, {});
    const write = await repo.claim(fresh, 'write', 'api-owner-fixture');
    expect(write).not.toBeNull();
    await repo.fail(write!, new ExecutionError('LOST_RESPONSE', false, true));
    const operation = (await repo.snapshot(fresh, owner.id.toString()))
      .operations[0];
    expect(
      (
        await http(
          0,
          '/runs/' + fresh + '/operations/' + operation.id + '/resolve',
          'POST',
          {
            decision: 'succeeded',
            reason: 'Owner verified existing remote task record',
            output: { externalId: 'http-verified' },
          },
        )
      ).status,
    ).toBe(201);
    const state = await repo.snapshot(fresh, owner.id.toString());
    expect(state.status).toBe('succeeded');
    expect(state.operations[0].resolvedBy).toBe(owner.id);
    expect(
      state.nodes.find((entry) => entry.nodeId === 'write')!.output,
    ).toEqual({ externalId: 'http-verified' });
  });

  test('P02-09 HTTP rejects malformed IDs, cursor, body and unlisted fields', async () => {
    expect((await http(0, '/runs/not-a-uuid')).status).toBe(400);
    expect((await http(0, '/runs/' + runId + '/events?after=-1')).status).toBe(
      400,
    );
    expect(
      (await http(0, '/runs', 'POST', { versionId: 'invalid', input: {} }))
        .status,
    ).toBe(400);
    expect(
      (await http(0, '/runs', 'POST', { versionId, input: {}, role: 'Owner' }))
        .status,
    ).toBe(400);
    expect(
      (
        await http(
          0,
          '/runs/' + runId + '/operations/' + operationId + '/resolve',
          'POST',
          {
            decision: 'retry',
            reason: 'short',
          },
        )
      ).status,
    ).toBe(400);
  });
});
