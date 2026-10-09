import { ChildProcess } from 'node:child_process';
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
  subprocess,
  testIdentity,
} from './fixtures';
import { TransportGate } from './transport-gate';

describe('P02 isolated real service transport outage acceptance', () => {
  const identity = testIdentity();
  const flowId = identity.id + 1n;
  const user = identity.id.toString();
  let prisma: PrismaService;
  let repo: RunsRepository;
  let gate: TransportGate | undefined;
  let child: ChildProcess | undefined;
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
  });
  afterEach(async () => {
    // Restore the gate before killing the child; no test can leave an outage.
    gate?.restore();
    if (child) await kill(child);
    child = undefined;
    await gate?.close();
    gate = undefined;
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  test.each(['postgres', 'redis'] as const)(
    'P02-05 %s TCP disconnect/reconnect preserves durable work and completed output',
    async (kind) => {
      gate = new TransportGate(kind === 'postgres' ? 15432 : 16380);
      await gate.start();
      child = subprocess('transport-worker.ts', {
        P02_TRANSPORT_GATE_KIND: kind,
        P02_TRANSPORT_GATE_PORT: String(gate.port),
      });
      // Drain child logs without buffering database URLs or unlimited output.
      child.stdout?.on('data', () => undefined);
      child.stderr?.on('data', () => undefined);
      await message(child, 'ready');
      const version = await repo.publish(
        flowId,
        user,
        chain(
          node('start', 'start'),
          node('completed', 'constant', {
            config: { value: { durable: true } },
          }),
          node('inflight', 'delay', {
            config: { milliseconds: 2000 },
            timeoutMs: 10000,
            maxAttempts: 3,
          }),
          node('tail', 'constant', { config: { value: { recovered: true } } }),
        ),
      );
      const first = (await repo.create(version.id, user, {})).runId;
      const before = await eventually(
        () => repo.snapshot(first, user),
        (snapshot) =>
          snapshot.nodes.some(
            (item) => item.nodeId === 'inflight' && item.status === 'running',
          ),
      );
      expect(
        before.nodes.find((item) => item.nodeId === 'completed')?.output,
      ).toEqual({ durable: true });
      gate.cut();
      expect(gate.broken).toBeGreaterThan(0);
      // API/database-side persistence remains available independently of the
      // worker's broken transport; capture new durable work during the outage.
      const second = (await repo.create(version.id, user, {})).runId;
      await new Promise<void>((resolve) => setTimeout(resolve, 700));
      expect(
        await prisma.flowRun.count({ where: { id: { in: [first, second] } } }),
      ).toBe(2);
      expect(
        await prisma.runOutbox.count({
          where: { runId: second, publishedAt: null },
        }),
      ).toBeGreaterThan(0);
      const during = await repo.snapshot(second, user);
      expect(during.nodes.every((item) => item.attemptCount === 0)).toBe(true);
      gate.restore();
      for (const runId of [first, second]) {
        const result = await eventually(
          () => repo.snapshot(runId, user),
          (snapshot) => snapshot.status === 'succeeded',
          30000,
        );
        expect(
          result.nodes.find((item) => item.nodeId === 'tail')?.output,
        ).toEqual({ recovered: true });
        const persisted = result.nodes.find(
          (item) => item.nodeId === 'completed',
        );
        expect(persisted?.attemptCount).toBe(1);
        expect(persisted?.attempts).toHaveLength(1);
        expect(persisted?.output).toEqual({ durable: true });
        const events = await prisma.runEvent.findMany({
          where: { runId },
          orderBy: { seq: 'asc' },
        });
        expect(events.map((event) => event.seq)).toEqual(
          events.map((_event, index) => index + 1),
        );
      }
    },
  );
});
