import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RunWorkerModule } from '../../src/runs/worker.module';
import { isolated } from './fixtures';

async function start(): Promise<void> {
  // Assert the unmodified dedicated service endpoints first. A gate is allowed
  // only in this child process and only on a loopback ephemeral port.
  isolated();
  const port = Number(process.env.P02_TRANSPORT_GATE_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Rejected transport gate port');
  const kind = process.env.P02_TRANSPORT_GATE_KIND;
  if (!['postgres', 'redis'].includes(kind || ''))
    throw new Error('Rejected transport gate kind');
  const database = new URL(process.env.DATABASE_URL!);
  if (kind === 'postgres') {
    database.port = String(port);
    database.searchParams.set('connect_timeout', '1');
    database.searchParams.set('pool_timeout', '1');
  } else {
    const redis = new URL(process.env.WORKFLOW_REDIS_URL!);
    redis.port = String(port);
    process.env.WORKFLOW_REDIS_URL = redis.toString();
  }
  const prisma = new PrismaService({
    datasources: { db: { url: database.toString() } },
  });
  const module = await Test.createTestingModule({ imports: [RunWorkerModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();
  await module.init();
  process.send?.({ type: 'ready' });
  process.on('message', (request: { type: string }) => {
    if (request.type === 'stop')
      void module.close().finally(() => process.exit(0));
  });
}
void start().catch(() => {
  process.send?.({ type: 'startup-failed' });
  process.exit(3);
});
