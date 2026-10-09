import { ChildProcess } from 'node:child_process';
import { PrismaService } from '../../src/prisma/prisma.service';
import { WorkflowCompiler } from '../../src/runs/compiler';
import {
  ExecutionError,
  WorkflowGraph,
  JsonObject,
} from '../../src/runs/contracts';
import { RunsRepository } from '../../src/runs/runs.repository';
import {
  chain,
  eventually,
  graph,
  isolated,
  kill,
  message,
  node,
  subprocess,
  testIdentity,
} from './fixtures';

describe('P02 real PostgreSQL recovery and isolation', () => {
  const identity = testIdentity();
  const other = testIdentity();
  const flowId = identity.id + 1n;
  const children = new Set<ChildProcess>();
  let prisma: PrismaService;
  let repo: RunsRepository;
  const user = identity.id.toString();

  beforeAll(async () => {
    isolated();
    prisma = new PrismaService();
    await prisma.$connect();
    repo = new RunsRepository(prisma, new WorkflowCompiler());
    await prisma.userEntity.createMany({
      data: [identity, other].map((item) => ({
        id: item.id,
        nickName: item.name,
        email: item.name + '@nexus.test',
      })),
    });
    await prisma.flowEntity.create({
      data: {
        id: flowId,
        ownerUserId: identity.id,
        displayName: identity.name,
      },
    });
  });
  afterAll(async () => {
    await Promise.all([...children].map(kill));
    if (prisma) await prisma.$disconnect();
  });

  async function create(
    spec: WorkflowGraph = chain(node('start', 'start')),
    input = {},
  ) {
    const version = await repo.publish(flowId, user, spec);
    const created = await repo.create(version.id, user, input);
    return { id: created.runId, status: created.status };
  }
  async function claim(runId: string, nodeId: string, worker = 'acceptance-a') {
    const result = await repo.claim(runId, nodeId, worker);
    expect(result).not.toBeNull();
    return result!;
  }

  test('P02-03 kill after committed claim recovers persisted run with a new fencing token', async () => {
    const run = await create(chain(node('start', 'start', { maxAttempts: 3 })));
    const child = subprocess('claim-worker.ts');
    children.add(child);
    await message(child, 'ready');
    const claimed = message(child, 'claimed');
    child.send({ type: 'claim', runId: run.id, nodeId: 'start' });
    const result = await claimed;
    expect(result.claim).not.toBeNull();
    const before = await prisma.nodeRun.findUniqueOrThrow({
      where: { runId_nodeId: { runId: run.id, nodeId: 'start' } },
    });
    expect(before.status).toBe('running');
    await kill(child);
    children.delete(child);
    await eventually(
      async () => {
        await repo.recover();
        return prisma.nodeRun.findUniqueOrThrow({ where: { id: before.id } });
      },
      (item) => item.status === 'ready',
      10000,
    );
    const fresh = await claim(run.id, 'start', 'restarted-worker');
    expect(fresh.fencing).toBeGreaterThan(before.fencing);
    expect(await repo.complete(fresh, {})).toBe(true);
    expect((await repo.snapshot(run.id, user)).status).toBe('succeeded');
  });

  test('P02-03 bounded recovery cursor reaches expired work behind persistent needs_attention runs', async () => {
    const paused = await create(
      chain(
        node('start', 'start'),
        node('write', 'http', {
          config: { url: 'https://fixture.nexus.test/write', method: 'POST' },
        }),
      ),
    );
    await repo.complete(await claim(paused.id, 'start'), {});
    await repo.fail(
      await claim(paused.id, 'write'),
      new ExecutionError('LOST_RESPONSE', false, true),
    );
    expect((await repo.snapshot(paused.id, user)).status).toBe(
      'needs_attention',
    );
    const target = await create(
      chain(node('start', 'start', { maxAttempts: 3 })),
    );
    const expired = await claim(target.id, 'start');
    await prisma.nodeRun.update({
      where: { id: expired.nodeRunId },
      data: { leaseUntil: new Date(Date.now() - 1) },
    });
    const activeCount = await prisma.flowRun.count({
      where: {
        OR: [
          {
            status: {
              in: ['queued', 'running', 'cancelling', 'needs_attention'],
            },
          },
          { nodes: { some: { status: 'running' } } },
        ],
      },
    });
    const scanner = new RunsRepository(prisma, new WorkflowCompiler());
    for (let index = 0; index <= activeCount; index++) await scanner.recover(1);
    const recovered = await prisma.nodeRun.findUniqueOrThrow({
      where: { id: expired.nodeRunId },
    });
    expect(recovered.status).not.toBe('running');
    expect(recovered.fencing).toBeGreaterThan(expired.fencing);
    expect((await repo.snapshot(paused.id, user)).status).toBe(
      'needs_attention',
    );
    expect((await repo.snapshot(paused.id, user)).operations[0].status).toBe(
      'unknown',
    );
  });

  test('P02-04 concurrent duplicate claims execute once and committed success cannot be replayed', async () => {
    const run = await create();
    const duplicates = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        repo.claim(run.id, 'start', 'duplicate-' + index),
      ),
    );
    const winners = duplicates.filter((value) => value !== null);
    expect(winners).toHaveLength(1);
    expect(await repo.complete(winners[0], {})).toBe(true);
    expect(await repo.complete(winners[0], {})).toBe(false);
    expect(await repo.claim(run.id, 'start', 'replay')).toBeNull();
    const saved = await prisma.nodeRun.findUniqueOrThrow({
      where: { runId_nodeId: { runId: run.id, nodeId: 'start' } },
    });
    expect(saved.attemptCount).toBe(1);
    expect(
      await prisma.nodeAttempt.count({ where: { nodeRunId: saved.id } }),
    ).toBe(1);
  });

  test('P02-04 expired worker late write and heartbeat are fenced even after another worker succeeds', async () => {
    const run = await create(chain(node('start', 'start', { maxAttempts: 3 })));
    const old = await claim(run.id, 'start');
    await prisma.nodeRun.update({
      where: { id: old.nodeRunId },
      data: { leaseUntil: new Date(Date.now() - 1) },
    });
    await eventually(
      async () => {
        await repo.recover();
        return prisma.nodeRun.findUniqueOrThrow({
          where: { id: old.nodeRunId },
        });
      },
      (row) => row.status === 'ready',
    );
    const fresh = await claim(run.id, 'start', 'new-worker');
    expect(await repo.heartbeat(old)).toBe(false);
    expect(await repo.complete(old, { stale: true })).toBe(false);
    expect(await repo.complete(fresh, {})).toBe(true);
    expect(await repo.fail(old, new ExecutionError('LATE_ERROR'))).toBe(false);
    expect((await repo.snapshot(run.id, user)).status).toBe('succeeded');
  });

  test('P02-06 cancellation races with completion and leaves exactly one terminal state', async () => {
    const run = await create(
      chain(
        node('start', 'start'),
        node('later', 'delay', { config: { milliseconds: 5000 } }),
      ),
    );
    const current = await claim(run.id, 'start');
    await repo.cancel(run.id, user);
    expect((await repo.snapshot(run.id, user)).status).toBe('cancelling');
    expect(await repo.complete(current, {})).toBe(false);
    expect(await repo.claim(run.id, 'later', 'late-worker')).toBeNull();
    await repo.cancel(run.id, user);
    const state = await repo.snapshot(run.id, user);
    expect(state.status).toBe('cancelled');
    expect(state.cancelRequestedAt).not.toBeNull();
    expect(
      state.nodes.every((item) =>
        ['cancelled', 'succeeded', 'failed', 'skipped'].includes(item.status),
      ),
    ).toBe(true);
    const events = await prisma.runEvent.findMany({
      where: { runId: run.id },
      orderBy: { seq: 'asc' },
    });
    expect(events.map((item) => item.seq)).toEqual(
      Array.from({ length: state.highWaterSeq }, (_, index) => index + 1),
    );
  });

  test('P02-06 pure retry is bounded and does not rewrite a successful predecessor', async () => {
    const run = await create(
      chain(
        node('start', 'start'),
        node('next', 'delay', { config: { milliseconds: 1 }, maxAttempts: 2 }),
      ),
    );
    await repo.complete(await claim(run.id, 'start'), {});
    const first = await claim(run.id, 'next');
    expect(await repo.fail(first, new ExecutionError('TEMPORARY', true))).toBe(
      true,
    );
    await eventually(
      async () => {
        await repo.recover();
        return prisma.nodeRun.findUniqueOrThrow({
          where: { id: first.nodeRunId },
        });
      },
      (item) => item.status === 'ready',
    );
    const second = await claim(run.id, 'next');
    expect(second.attemptNumber).toBe(2);
    await repo.fail(second, new ExecutionError('TEMPORARY', true));
    await repo.recover();
    expect((await repo.snapshot(run.id, user)).status).toBe('failed');
    expect(await repo.claim(run.id, 'next', 'unbounded')).toBeNull();
    expect(
      (
        await prisma.nodeRun.findUniqueOrThrow({
          where: { runId_nodeId: { runId: run.id, nodeId: 'start' } },
        })
      ).attemptCount,
    ).toBe(1);
  });

  test('P02-09 published V1 and run input remain immutable when source and V2 change', async () => {
    const original = { marker: 'original' };
    const v1 = await repo.publish(flowId, user, chain(node('start', 'start')));
    const created = await repo.create(v1.id, user, original);
    const run = { id: created.runId };
    original.marker = 'changed-after-create';
    await prisma.flowEntity.update({
      where: { id: flowId },
      data: {
        displayName: 'edited',
        configInfoForRun: '{"untrusted":"edited"}',
      },
    });
    const v2 = await repo.publish(
      flowId,
      user,
      chain(
        node('start', 'start'),
        node('new', 'constant', { config: { value: {} } }),
      ),
    );
    expect(v2.id).not.toBe(v1.id);
    const saved = await repo.snapshot(run.id, user);
    expect(saved.versionId).toBe(v1.id);
    expect(saved.input).toEqual({ marker: 'original' });
    expect(saved.nodes.map((item) => item.nodeId)).toEqual(['start']);
    expect(
      (await prisma.workflowVersion.findUniqueOrThrow({ where: { id: v1.id } }))
        .graph,
    ).toEqual(v1.graph);
  });

  test('P02-09 cross-user read create publish cancel are rejected and disabled versions cannot run', async () => {
    const version = await repo.publish(
      flowId,
      user,
      chain(node('start', 'start')),
    );
    const created = await repo.create(version.id, user, {});
    const run = { id: created.runId };
    await expect(repo.snapshot(run.id, other.id.toString())).rejects.toThrow();
    await expect(
      repo.create(version.id, other.id.toString(), {}),
    ).rejects.toThrow();
    await expect(
      repo.publish(flowId, other.id.toString(), chain(node('start', 'start'))),
    ).rejects.toThrow();
    await expect(repo.cancel(run.id, other.id.toString())).rejects.toThrow();
    await prisma.workflowVersion.update({
      where: { id: version.id },
      data: { disabledAt: new Date() },
    });
    await expect(repo.create(version.id, user, {})).rejects.toThrow();
  });

  test('P02-07 unknown write requires Owner evidence and preserves stable key when confirmed not executed', async () => {
    const run = await create(
      chain(
        node('start', 'start'),
        node('write', 'http', {
          config: { url: 'https://fixture.nexus.test/write', method: 'POST' },
          maxAttempts: 3,
        }),
      ),
    );
    await repo.complete(await claim(run.id, 'start'), {});
    const first = await claim(run.id, 'write');
    await repo.fail(first, new ExecutionError('LOST_RESPONSE', false, true));
    const state = await repo.snapshot(run.id, user);
    expect(state.status).toBe('needs_attention');
    const operation = state.operations[0];
    expect(operation.status).toBe('unknown');
    await prisma.workspaceMember.create({
      data: {
        workspaceId: state.workspaceId,
        userId: other.id,
        role: 'Operator',
      },
    });
    await expect(
      repo.resolveOperation(
        run.id,
        operation.id,
        other.id.toString(),
        'not_executed',
        'Operator cannot confirm external evidence',
      ),
    ).rejects.toThrow();
    await expect(
      repo.resolveOperation(
        run.id,
        operation.id,
        user,
        'not_executed',
        'short',
      ),
    ).rejects.toThrow();
    expect((await repo.snapshot(run.id, user)).operations[0].status).toBe(
      'unknown',
    );
    await repo.resolveOperation(
      run.id,
      operation.id,
      user,
      'not_executed',
      'Owner verified target request log and found no write',
    );
    const retry = await claim(run.id, 'write', 'authorized-retry');
    expect(retry.operationKey).toBe(first.operationKey);
    expect(retry.attemptNumber).toBe(2);
    await repo.complete(retry, { externalId: 'verified-after-retry' });
    const after = await repo.snapshot(run.id, user);
    expect(after.status).toBe('succeeded');
    expect(after.operations).toHaveLength(1);
    expect(after.operations[0].resolvedBy).toBe(identity.id);
    await expect(
      repo.resolveOperation(
        run.id,
        operation.id,
        user,
        'not_executed',
        'Owner cannot reopen a finished run',
      ),
    ).rejects.toThrow();
    const audit = await prisma.runEvent.findMany({
      where: { runId: run.id, type: 'operation.resolved' },
    });
    expect(audit).toHaveLength(1);
    expect((audit[0].payload as JsonObject).decision).toBe('not_executed');
    await prisma.workspaceMember.delete({
      where: {
        workspaceId_userId: {
          workspaceId: state.workspaceId,
          userId: other.id,
        },
      },
    });
  });

  test.each(['uncertain', 'succeeded'] as const)(
    'P02-07 parallel fatal failure waits for already-claimed POST %s outcome and preserves external evidence',
    async (outcome) => {
      // Real PostgreSQL state-machine/transaction coverage. No outbound HTTP is
      // performed: claim/fail report the transport outcome deterministically.
      const run = await create(
        graph(
          [
            node('start', 'start'),
            node('fatal', 'delay', { config: { milliseconds: 1 } }),
            node('write', 'http', {
              config: {
                url: 'https://fixture.nexus.test/write',
                method: 'POST',
              },
            }),
            node('unclaimed', 'constant', { config: { value: {} } }),
            node('downstream', 'constant', { config: { value: {} } }),
          ],
          [
            { id: 'start-fatal', from: 'start', to: 'fatal' },
            { id: 'start-write', from: 'start', to: 'write' },
            { id: 'start-unclaimed', from: 'start', to: 'unclaimed' },
            { id: 'write-downstream', from: 'write', to: 'downstream' },
          ],
        ),
      );
      await repo.complete(await claim(run.id, 'start'), {});
      const fatal = await claim(run.id, 'fatal');
      const write = await claim(run.id, 'write');
      expect(
        await repo.fail(fatal, new ExecutionError('FATAL_LOCAL_NODE')),
      ).toBe(true);
      const waiting = await repo.snapshot(run.id, user);
      expect(['failed', 'succeeded', 'cancelled']).not.toContain(
        waiting.status,
      );
      expect(waiting.errorCode).toBe('NODE_FAILED');
      expect(waiting.finishedAt).toBeNull();
      expect(
        waiting.nodes.find((item) => item.nodeId === 'write')!.status,
      ).toBe('running');
      expect(waiting.operations).toHaveLength(1);
      expect(waiting.operations[0].status).toBe('executing');
      for (const nodeId of ['unclaimed', 'downstream']) {
        const saved = waiting.nodes.find((item) => item.nodeId === nodeId)!;
        expect(saved.status).toBe('cancelled');
        expect(saved.attemptCount).toBe(0);
        expect(await repo.claim(run.id, nodeId, 'must-not-start')).toBeNull();
      }
      expect(await repo.heartbeat(write)).toBe(true);
      const verifiedOutput = { externalId: 'already-created-' + outcome };
      if (outcome === 'uncertain') {
        expect(
          await repo.fail(
            write,
            new ExecutionError('LOST_RESPONSE', false, true),
          ),
        ).toBe(true);
        const uncertain = await repo.snapshot(run.id, user);
        expect(uncertain.status).toBe('needs_attention');
        expect(uncertain.finishedAt).toBeNull();
        expect(uncertain.operations[0].status).toBe('unknown');
        await repo.resolveOperation(
          run.id,
          uncertain.operations[0].id,
          user,
          'succeeded',
          'Owner verified remote task exists despite local branch failure',
          verifiedOutput,
        );
      } else {
        expect(await repo.complete(write, verifiedOutput)).toBe(true);
      }
      const final = await repo.snapshot(run.id, user);
      expect(final.status).toBe('failed');
      expect(final.errorCode).toBe('NODE_FAILED');
      expect(final.finishedAt).not.toBeNull();
      expect(final.operations).toHaveLength(1);
      expect(final.operations[0].status).toBe('succeeded');
      expect(final.operations[0].result).toEqual(verifiedOutput);
      expect(
        final.nodes.find((item) => item.nodeId === 'write')!.output,
      ).toEqual(verifiedOutput);
      expect(
        final.nodes.find((item) => item.nodeId === 'write')!.attemptCount,
      ).toBe(1);
      expect(await repo.claim(run.id, 'write', 'must-not-replay')).toBeNull();
      const events = await prisma.runEvent.findMany({
        where: { runId: run.id },
        orderBy: { seq: 'asc' },
      });
      expect(events.map((item) => item.seq)).toEqual(
        Array.from({ length: final.highWaterSeq }, (_, index) => index + 1),
      );
      expect(events.filter((item) => item.type === 'run.failed')).toHaveLength(
        1,
      );
      expect(events[events.length - 1].type).toBe('run.failed');
      if (outcome === 'uncertain') {
        expect(final.operations[0].resolvedBy).toBe(identity.id);
        const resolution = events.filter(
          (item) => item.type === 'operation.resolved',
        );
        expect(resolution).toHaveLength(1);
        expect((resolution[0].payload as JsonObject).decision).toBe(
          'succeeded',
        );
        expect(resolution[0].seq).toBeLessThan(events[events.length - 1].seq);
      }
    },
  );

  test('P02-07 Owner-confirmed success reuses verified output and never creates a second attempt', async () => {
    const run = await create(
      chain(
        node('start', 'start'),
        node('write', 'http', {
          config: { url: 'https://fixture.nexus.test/write', method: 'POST' },
        }),
      ),
    );
    await repo.complete(await claim(run.id, 'start'), {});
    const current = await claim(run.id, 'write');
    await repo.fail(current, new ExecutionError('LOST_RESPONSE', false, true));
    const operation = (await repo.snapshot(run.id, user)).operations[0];
    await expect(
      repo.resolveOperation(
        run.id,
        operation.id,
        user,
        'succeeded',
        'Owner verified external task exists',
      ),
    ).rejects.toThrow();
    await repo.resolveOperation(
      run.id,
      operation.id,
      user,
      'succeeded',
      'Owner verified external task exists',
      { externalId: 'existing-task' },
    );
    expect(await repo.claim(run.id, 'write', 'redelivery')).toBeNull();
    const saved = await repo.snapshot(run.id, user);
    expect(saved.status).toBe('succeeded');
    const written = saved.nodes.find((item) => item.nodeId === 'write')!;
    expect(written.attemptCount).toBe(1);
    expect(written.output).toEqual({ externalId: 'existing-task' });
  });

  test.each(['fail', 'continue'])(
    'P02-10 foreach %s policy keeps item history and caps simultaneous ready/running slots',
    async (policy) => {
      const run = await create(
        chain(
          node('start', 'start'),
          node('each', 'foreach', {
            inputBindings: {
              items: {
                source: 'literal',
                value: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
              },
            },
            config: {
              maxItems: 3,
              concurrency: 2,
              itemIdPath: '/id',
              failurePolicy: policy,
              action: {
                kind: 'transform',
                inputSchema: { type: 'object' },
                outputSchema: { type: 'object' },
                config: { operation: 'identity' },
              },
            },
          }),
        ),
      );
      await repo.complete(await claim(run.id, 'start'), {});
      expect(await repo.claim(run.id, 'each', 'expander')).toBeNull();
      const before = await repo.snapshot(run.id, user);
      const items = before.nodes
        .filter((item) => item.parentNodeId === 'each')
        .sort((a, b) => a.itemIndex! - b.itemIndex!);
      expect(items).toHaveLength(3);
      expect(
        items.filter((item) => ['ready', 'running'].includes(item.status)),
      ).toHaveLength(2);
      const first = await claim(run.id, items[0].nodeId);
      const second = await claim(run.id, items[1].nodeId);
      expect(await repo.claim(run.id, items[2].nodeId, 'over-cap')).toBeNull();
      await repo.complete(first, { retained: 'a' });
      const third = await claim(run.id, items[2].nodeId);
      await repo.fail(second, new ExecutionError('INVALID_ITEM'));
      await repo.complete(third, { retained: 'c' });
      const after = await repo.snapshot(run.id, user);
      expect(after.status).toBe(policy === 'fail' ? 'failed' : 'succeeded');
      const parent = after.nodes.find((item) => item.nodeId === 'each')!;
      expect(parent.output).toEqual({
        items: [
          { itemId: 'a', status: 'succeeded', output: { retained: 'a' } },
          { itemId: 'b', status: 'failed', errorCode: 'INVALID_ITEM' },
          { itemId: 'c', status: 'succeeded', output: { retained: 'c' } },
        ],
      });
      expect(
        after.nodes
          .filter((item) => item.parentNodeId === 'each')
          .every((item) => item.attemptCount === 1),
      ).toBe(true);
      expect(
        new Set([first.operationKey, second.operationKey, third.operationKey])
          .size,
      ).toBe(3);
    },
  );

  test.each(['overflow', 'duplicate'])(
    'P02-10 foreach %s input fails atomically before creating any child',
    async (fault) => {
      const values =
        fault === 'overflow'
          ? [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
          : [{ id: 'a' }, { id: 'a' }];
      const run = await create(
        chain(
          node('start', 'start'),
          node('each', 'foreach', {
            inputBindings: { items: { source: 'literal', value: values } },
            config: {
              maxItems: 2,
              concurrency: 1,
              itemIdPath: '/id',
              failurePolicy: 'fail',
              action: {
                kind: 'transform',
                inputSchema: { type: 'object' },
                outputSchema: { type: 'object' },
                config: { operation: 'identity' },
              },
            },
          }),
        ),
      );
      await repo.complete(await claim(run.id, 'start'), {});
      expect(await repo.claim(run.id, 'each', 'expander')).toBeNull();
      const saved = await repo.snapshot(run.id, user);
      expect(saved.status).toBe('failed');
      expect(
        saved.nodes.filter((item) => item.parentNodeId === 'each'),
      ).toHaveLength(0);
      expect(
        saved.nodes.find((item) => item.nodeId === 'each')!.errorCode,
      ).toBe(
        fault === 'overflow' ? 'FOREACH_ITEMS_LIMIT' : 'DUPLICATE_ITEM_ID',
      );
    },
  );
});
