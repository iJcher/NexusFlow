import 'reflect-metadata';
import { PrismaService } from '../../src/prisma/prisma.service';
import { WorkflowCompiler } from '../../src/runs/compiler';
import { RunsRepository } from '../../src/runs/runs.repository';
import { isolated } from './fixtures';

async function start(): Promise<void> {
  isolated();
  const prisma = new PrismaService();
  await prisma.$connect();
  const repository = new RunsRepository(prisma, new WorkflowCompiler());
  process.send?.({ type: 'ready' });
  process.on(
    'message',
    (request: { type: string; runId: string; nodeId: string }) => {
      if (request.type !== 'claim') return;
      void repository
        .claim(request.runId, request.nodeId, 'test-kill-' + process.pid)
        .then((claim) => {
          // The parent kills only after this IPC: claim's database transaction really committed.
          process.send?.({ type: 'claimed', claim });
          // Keep process alive without completing the node. This is a test fixture, not production.
        })
        .catch(() => {
          process.send?.({ type: 'claim-failed' });
          process.exitCode = 3;
          void prisma.$disconnect().finally(() => process.exit(3));
        });
    },
  );
}
void start().catch(() => {
  process.send?.({ type: 'startup-failed' });
  process.exit(3);
});
