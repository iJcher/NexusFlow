import { randomUUID } from 'node:crypto';
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Queue, Worker, Job, ConnectionOptions } from 'bullmq';
import { RunsRepository } from './repository';
import { NodeRegistry } from './node-registry';
import { ExecutionError } from './contracts';

function integer(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error('Invalid ' + name);
  return value;
}
export function workflowConnection(worker = false): ConnectionOptions {
  const raw = process.env.WORKFLOW_REDIS_URL;
  if (!raw) throw new Error('WORKFLOW_REDIS_URL is required for worker');
  const url = new URL(raw);
  if (!['redis:', 'rediss:'].includes(url.protocol))
    throw new Error('Invalid WORKFLOW_REDIS_URL');
  if (process.env.NODE_ENV === 'production' && raw === process.env.REDIS_URL)
    throw new Error(
      'Workflow queue must be separate from authentication/cache Redis',
    );
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: integer('WORKFLOW_REDIS_DB', Number(url.pathname.slice(1) || 0), 0, 15),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: worker ? null : 1,
    connectTimeout: 3000,
  };
}
@Injectable()
export class WorkerRuntime implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerRuntime.name);
  readonly workerId = randomUUID();
  private queue?: Queue;
  private worker?: Worker;
  private timer?: ReturnType<typeof setInterval>;
  private ticking = false;
  private stopped = false;
  private readonly controllers = new Set<AbortController>();
  constructor(
    readonly repo: RunsRepository,
    readonly registry: NodeRegistry,
  ) {}
  async onModuleInit(): Promise<void> {
    await this.start();
  }
  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }
  async start(): Promise<void> {
    if (this.queue) return;
    const name = process.env.WORKFLOW_QUEUE_NAME || 'nf-runs';
    const prefix = process.env.WORKFLOW_QUEUE_PREFIX || 'nf-runs';
    this.stopped = false;
    this.queue = new Queue(name, { connection: workflowConnection(), prefix });
    this.queue.on('error', () => this.logger.warn('QUEUE_UNAVAILABLE'));
    const client = await this.queue.client;
    const info = await client.info();
    if (!/^maxmemory_policy:noeviction\r?$/m.test(info)) {
      await this.queue.close();
      this.queue = undefined;
      throw new Error('Workflow Redis must use noeviction');
    }
    this.worker = new Worker(
      name,
      (job: Job<{ runId: string; nodeId: string }>) => this.process(job),
      {
        connection: workflowConnection(true),
        prefix,
        concurrency: integer('RUN_WORKER_CONCURRENCY', 8, 1, 64),
      },
    );
    this.worker.on('error', () => this.logger.warn('WORKER_QUEUE_UNAVAILABLE'));
    this.worker.on('failed', () => this.logger.warn('WORKER_JOB_FAILED'));
    this.timer = setInterval(
      () => {
        void this.tick();
      },
      integer('RUN_RECOVERY_INTERVAL_MS', 1000, 100, 10000),
    );
    await this.tick();
  }
  private async tick(): Promise<void> {
    if (this.ticking || this.stopped) return;
    this.ticking = true;
    try {
      await this.repo.recover();
      const outbox = await this.repo.prisma.runOutbox.findMany({
        where: { publishedAt: null, nextAttemptAt: { lte: new Date() } },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });
      for (const record of outbox) {
        try {
          await this.queue!.add(
            'node',
            { runId: record.runId, nodeId: record.nodeId },
            { jobId: record.id, removeOnComplete: true, removeOnFail: true },
          );
          await this.repo.prisma.runOutbox.updateMany({
            where: { id: record.id, publishedAt: null },
            data: { publishedAt: new Date(), attempts: { increment: 1 } },
          });
        } catch {
          await this.repo.prisma.runOutbox.updateMany({
            where: { id: record.id, publishedAt: null },
            data: {
              attempts: { increment: 1 },
              nextAttemptAt: new Date(Date.now() + 2000),
            },
          });
          this.logger.warn('OUTBOX_DELIVERY_UNAVAILABLE');
        }
      }
    } catch {
      this.logger.warn('RUN_RECOVERY_UNAVAILABLE');
    } finally {
      this.ticking = false;
    }
  }
  private async process(
    job: Job<{ runId: string; nodeId: string }>,
  ): Promise<void> {
    const claim = await this.repo.claim(
      job.data.runId,
      job.data.nodeId,
      this.workerId,
    );
    if (!claim) return;
    const controller = new AbortController();
    this.controllers.add(controller);
    let heartbeating = false;
    const heartbeat = setInterval(
      () => {
        if (heartbeating) return;
        heartbeating = true;
        void this.repo
          .heartbeat(claim)
          .then((valid) => {
            if (!valid) controller.abort();
          })
          .catch(() => controller.abort())
          .finally(() => {
            heartbeating = false;
          });
      },
      Math.max(100, Math.floor(this.repo.leaseMs / 3)),
    );
    const timeout = setTimeout(
      () => controller.abort(),
      claim.spec.timeoutMs ?? 30000,
    );
    try {
      const executing = this.registry.execute(claim.spec, claim.inputs, {
        runId: claim.runId,
        nodeId: claim.nodeId,
        attemptId: claim.attemptId,
        attemptNumber: claim.attemptNumber,
        fencing: claim.fencing,
        operationKey: claim.operationKey,
        signal: controller.signal,
      });
      let onAbort: (() => void) | undefined;
      const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = () =>
          reject(
            new ExecutionError(
              'NODE_ABORTED',
              !(
                claim.spec.kind === 'http' &&
                claim.spec.config?.method === 'POST'
              ),
              claim.spec.kind === 'http' &&
                claim.spec.config?.method === 'POST',
            ),
          );
        if (controller.signal.aborted) onAbort();
        else
          controller.signal.addEventListener('abort', onAbort, { once: true });
      });
      let output;
      try {
        output = await Promise.race([executing, aborted]);
      } finally {
        if (onAbort) controller.signal.removeEventListener('abort', onAbort);
      }
      await this.repo.complete(claim, output);
    } catch (error) {
      const write =
        claim.spec.kind === 'http' && claim.spec.config?.method === 'POST';
      const failure =
        error instanceof ExecutionError
          ? error
          : new ExecutionError('NODE_EXECUTION_FAILED', false, write);
      if (controller.signal.aborted)
        await this.repo.fail(
          claim,
          new ExecutionError('NODE_ABORTED', !write, write),
        );
      else await this.repo.fail(claim, failure);
    } finally {
      clearInterval(heartbeat);
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    for (const controller of this.controllers) controller.abort();
    if (this.worker) await this.worker.close();
    while (this.ticking)
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
    if (this.queue) await this.queue.close();
    this.worker = undefined;
    this.queue = undefined;
  }
}
