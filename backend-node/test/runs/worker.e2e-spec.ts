import { ChildProcess } from 'node:child_process';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '../../src/prisma/prisma.service';
import { WorkflowCompiler } from '../../src/runs/compiler';
import { RunsRepository } from '../../src/runs/runs.repository';
import {
  chain,
  eventually,
  isolated,
  kill,
  message,
  node,
  object,
  subprocess,
  testIdentity,
} from './fixtures';
import { HttpAcceptanceFixture } from './http-fixture';

describe('P02 real Redis BullMQ independent worker fault acceptance', () => {
  const identity = testIdentity();
  const flowId = identity.id + 1n;
  const user = identity.id.toString();
  const children = new Set<ChildProcess>();
  let prisma: PrismaService;
  let repo: RunsRepository;
  let connection: Redis;
  let queue: Queue;
  let fixture: HttpAcceptanceFixture;

  beforeAll(async () => {
    isolated();
    prisma = new PrismaService();
    await prisma.$connect();
    repo = new RunsRepository(prisma, new WorkflowCompiler());
    await prisma.userEntity.create({
      data: {
        id: identity.id,
        nickName: identity.name,
        email: identity.name + '@nexus.test',
      },
    });
    await prisma.flowEntity.create({
      data: {
        id: flowId,
        ownerUserId: identity.id,
        displayName: identity.name,
      },
    });
    connection = new Redis(process.env.WORKFLOW_REDIS_URL!, {
      maxRetriesPerRequest: null,
    });
    await connection.ping();
    expect(await connection.config('GET', 'maxmemory-policy')).toEqual([
      'maxmemory-policy',
      'noeviction',
    ]);
    // BullMQ owns its compatible Redis client; the separate inspection client is
    // ioredis 6 and must not be forced into BullMQ's ioredis 5 nominal type.
    queue = new Queue(process.env.WORKFLOW_QUEUE_NAME || 'nf-runs', {
      connection: {
        host: '127.0.0.1',
        port: 16380,
        maxRetriesPerRequest: null,
      },
      prefix: process.env.WORKFLOW_QUEUE_PREFIX!,
    });
  });
  beforeEach(async () => {
    fixture = new HttpAcceptanceFixture();
    await fixture.start();
  });
  afterEach(async () => {
    await Promise.all([...children].map(kill));
    children.clear();
    await fixture.close();
  });
  afterAll(async () => {
    await queue?.close();
    connection?.disconnect();
    await prisma?.$disconnect();
  });

  async function worker(): Promise<ChildProcess> {
    const child = subprocess('runtime-worker.ts', {
      P02_HTTP_FIXTURE_URL: fixture.url,
    });
    children.add(child);
    await message(child, 'ready');
    return child;
  }
  async function run(
    spec: Parameters<RunsRepository['publish']>[2],
    input = {},
  ) {
    const version = await repo.publish(flowId, user, spec);
    return (await repo.create(version.id, user, input)).runId;
  }
  async function snapshot(runId: string) {
    return repo.snapshot(runId, user);
  }

  test('P02-05 published ready queue entries lost in Redis are reconciled from PostgreSQL', async () => {
    const runId = await run(
      chain(
        node('start', 'start'),
        node('after', 'constant', { config: { value: { kept: true } } }),
      ),
    );
    // Only remove this runner namespace; never flush Redis or delete another project's jobs.
    await queue.obliterate({ force: true });
    await prisma.runOutbox.updateMany({
      where: { runId },
      data: { publishedAt: new Date() },
    });
    await prisma.nodeRun.updateMany({
      where: { runId, status: 'ready' },
      data: { lastDispatchAt: new Date(Date.now() - 120000) },
    });
    await worker();
    const saved = await eventually(
      () => snapshot(runId),
      (value) => value.status === 'succeeded',
      20000,
    );
    expect(
      saved.nodes.every(
        (item) => item.attemptCount === 1 && item.status === 'succeeded',
      ),
    ).toBe(true);
    expect(saved.nodes.find((item) => item.nodeId === 'after')?.output).toEqual(
      { kept: true },
    );
    expect(await prisma.runOutbox.count({ where: { runId } })).toBeGreaterThan(
      0,
    );
  });

  test('P02-04 duplicate actual BullMQ deliveries reuse successful node output', async () => {
    const runId = await run(chain(node('start', 'start')));
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        queue.add(
          'execute',
          { runId, nodeId: 'start' },
          { jobId: 'duplicate-' + runId + '-' + index },
        ),
      ),
    );
    await worker();
    await eventually(
      () => snapshot(runId),
      (value) => value.status === 'succeeded',
    );
    await queue.add(
      'execute',
      { runId, nodeId: 'start' },
      { jobId: 'late-duplicate-' + runId },
    );
    await eventually(
      () =>
        queue
          .getJob('late-duplicate-' + runId)
          .then(async (job) => (job ? job.getState() : 'completed')),
      (state) => state === 'completed',
    );
    const saved = await snapshot(runId);
    expect(saved.nodes[0].attemptCount).toBe(1);
    expect(saved.nodes[0].attempts).toHaveLength(1);
  });

  test('P02-06 real worker timeout retries only the timed-out pure node within its budget', async () => {
    const runId = await run(
      chain(
        node('start', 'start'),
        node('slow', 'delay', {
          config: { milliseconds: 2000 },
          timeoutMs: 100,
          maxAttempts: 2,
        }),
      ),
    );
    await worker();
    const saved = await eventually(
      () => snapshot(runId),
      (value) => value.status === 'failed',
    );
    const predecessor = saved.nodes.find((item) => item.nodeId === 'start')!;
    const timed = saved.nodes.find((item) => item.nodeId === 'slow')!;
    expect(predecessor.attemptCount).toBe(1);
    expect(timed.attemptCount).toBe(2);
    expect(timed.attempts.map((attempt) => attempt.number)).toEqual([1, 2]);
    expect(timed.attempts.every((attempt) => attempt.status === 'failed')).toBe(
      true,
    );
    expect(timed.status).toBe('failed');
    await repo.recover();
    expect(
      (await snapshot(runId)).nodes.find((item) => item.nodeId === 'slow')!
        .attemptCount,
    ).toBe(2);
  });

  test('P02-06 worker sees durable cancellation, aborts active delay and never claims its successor', async () => {
    const runId = await run(
      chain(
        node('start', 'start'),
        node('slow', 'delay', {
          config: { milliseconds: 5000 },
          timeoutMs: 10000,
        }),
        node('unwanted', 'constant', {
          config: { value: { shouldNotExist: true } },
        }),
      ),
    );
    await worker();
    await eventually(
      () => snapshot(runId),
      (value) =>
        value.nodes.some(
          (item) => item.nodeId === 'slow' && item.status === 'running',
        ),
    );
    await repo.cancel(runId, user);
    const cancelled = await eventually(
      () => snapshot(runId),
      (value) => value.status === 'cancelled',
    );
    expect(cancelled.nodes.find((item) => item.nodeId === 'slow')!.status).toBe(
      'cancelled',
    );
    const unwanted = cancelled.nodes.find(
      (item) => item.nodeId === 'unwanted',
    )!;
    expect(unwanted.status).toBe('cancelled');
    expect(unwanted.attemptCount).toBe(0);
    expect(unwanted.attempts).toHaveLength(0);
    const terminal = await prisma.runEvent.findMany({
      where: {
        runId,
        type: { in: ['run.succeeded', 'run.failed', 'run.cancelled'] },
      },
    });
    expect(terminal.map((item) => item.type)).toEqual(['run.cancelled']);
  });

  test('P02-03 kill after real POST reaches remote but before result commit recovers to unknown', async () => {
    const runId = await run(
      chain(
        node('start', 'start'),
        node('write', 'http', {
          config: { url: 'https://fixture.nexus.test/hold', method: 'POST' },
          timeoutMs: 20000,
          maxAttempts: 5,
        }),
      ),
    );
    const child = await worker();
    await eventually(
      () => Promise.resolve(fixture.accepted.length),
      (count) => count === 1,
    );
    const claimed = await snapshot(runId);
    expect(claimed.nodes.find((item) => item.nodeId === 'write')!.status).toBe(
      'running',
    );
    expect(claimed.operations[0].status).toBe('executing');
    await kill(child);
    children.delete(child);
    fixture.releaseAll();
    await worker();
    const recovered = await eventually(
      () => snapshot(runId),
      (value) => value.status === 'needs_attention',
      15000,
    );
    expect(recovered.operations[0].status).toBe('unknown');
    expect(recovered.operations[0].operationKey).toBe(
      claimed.operations[0].operationKey,
    );
    expect(
      recovered.nodes.find((item) => item.nodeId === 'write')!.attemptCount,
    ).toBe(1);
    expect(fixture.accepted).toHaveLength(1);
  });

  test('P02-07 external POST accepted then socket response lost becomes unknown and is never blindly repeated', async () => {
    const runId = await run(
      chain(
        node('start', 'start'),
        node('write', 'http', {
          config: {
            url: 'https://fixture.nexus.test/accept-and-drop',
            method: 'POST',
          },
          maxAttempts: 5,
          inputBindings: {
            payload: { source: 'literal', value: 'side-effect' },
          },
        }),
      ),
    );
    const first = await worker();
    const saved = await eventually(
      () => snapshot(runId),
      (value) => value.status === 'needs_attention',
    );
    expect(fixture.accepted).toHaveLength(1);
    expect(fixture.accepted[0].method).toBe('POST');
    expect(saved.operations).toHaveLength(1);
    expect(saved.operations[0].status).toBe('unknown');
    expect(fixture.accepted[0].key).toBe(saved.operations[0].operationKey);
    await kill(first);
    children.delete(first);
    await repo.recover();
    const restarted = await worker();
    await queue.add(
      'execute',
      { runId, nodeId: 'write' },
      { jobId: 'unknown-redelivery-' + runId },
    );
    await eventually(
      () =>
        queue
          .getJob('unknown-redelivery-' + runId)
          .then(async (job) => (job ? job.getState() : 'completed')),
      (state) => state === 'completed',
    );
    expect(fixture.accepted).toHaveLength(1);
    expect((await snapshot(runId)).status).toBe('needs_attention');
    expect((await snapshot(runId)).operations[0].operationKey).toBe(
      saved.operations[0].operationKey,
    );
    await kill(restarted);
    children.delete(restarted);
  });

  test('P02-10 foreach kill restart resumes only incomplete items with stable distinct keys and original order', async () => {
    const items = Array.from({ length: 6 }, (_, index) => ({
      stableId: 'item-' + index,
    }));
    const runId = await run(
      chain(
        node('start', 'start'),
        node('batch', 'foreach', {
          inputSchema: {
            type: 'object',
            properties: { items: { type: 'array', items: object } },
            required: ['items'],
            additionalProperties: false,
          },
          inputBindings: { items: { source: 'literal', value: items } },
          config: {
            maxItems: 6,
            concurrency: 2,
            itemIdPath: '/stableId',
            failurePolicy: 'fail',
            action: {
              kind: 'http',
              inputSchema: object,
              outputSchema: object,
              config: {
                url: 'https://fixture.nexus.test/hold-after-first',
                method: 'GET',
              },
              timeoutMs: 20000,
              maxAttempts: 3,
            },
          },
        }),
      ),
    );
    const first = await worker();
    const before = await eventually(
      () => snapshot(runId),
      (value) =>
        value.nodes.some(
          (item) =>
            item.parentNodeId === 'batch' && item.status === 'succeeded',
        ) &&
        value.nodes.some(
          (item) => item.parentNodeId === 'batch' && item.status === 'running',
        ),
    );
    const success = before.nodes.find(
      (item) => item.parentNodeId === 'batch' && item.status === 'succeeded',
    )!;
    expect(
      before.nodes.filter(
        (item) => item.parentNodeId === 'batch' && item.status === 'running',
      ).length,
    ).toBeLessThanOrEqual(2);
    await kill(first);
    children.delete(first);
    fixture.releaseAll();
    await worker();
    const after = await eventually(
      () => snapshot(runId),
      (value) => value.status === 'succeeded',
      30000,
    );
    const restored = after.nodes.find((item) => item.id === success.id)!;
    expect(restored.attemptCount).toBe(success.attemptCount);
    expect(restored.output).toEqual(success.output);
    const childrenRows = after.nodes
      .filter((item) => item.parentNodeId === 'batch')
      .sort((left, right) => left.itemIndex! - right.itemIndex!);
    expect(childrenRows.map((item) => item.itemId)).toEqual(
      items.map((item) => item.stableId),
    );
    expect(childrenRows.every((item) => item.status === 'succeeded')).toBe(
      true,
    );
    const keys = fixture.accepted.map((item) => item.key);
    expect(keys.every((key) => typeof key === 'string' && key.length > 0)).toBe(
      true,
    );
    expect(new Set(keys).size).toBe(items.length);
    const parentOutput = after.nodes.find((item) => item.nodeId === 'batch')
      ?.output as { items: { itemId: string; status: string }[] };
    expect(parentOutput.items.map((item) => item.itemId)).toEqual(
      items.map((item) => item.stableId),
    );
  });
});
