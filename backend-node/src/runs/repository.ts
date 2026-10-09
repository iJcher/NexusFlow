import { createHash, randomUUID } from 'node:crypto';
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, FlowRun, NodeRun } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowCompiler, graphHash, canonicalJson } from './compiler';
import { resolveInputs, readPointer } from './bindings';
import { planDag } from './scheduler';
import {
  ExecutionError,
  Json,
  JsonObject,
  NodeSpec,
  WorkflowGraph,
  RUN_TERMINAL,
  NODE_TERMINAL,
  jsonString,
  assertJson,
} from './contracts';

type Tx = Prisma.TransactionClient;
export interface ClaimedNode {
  runId: string;
  nodeRunId: string;
  nodeId: string;
  attemptId: string;
  attemptNumber: number;
  fencing: number;
  leaseUntil: Date;
  spec: NodeSpec;
  inputs: JsonObject;
  operationKey: string;
}
export function dbJson(
  value: Json,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}
function json(value: Prisma.JsonValue): Json {
  return value as Json;
}
function operationKey(runId: string, nodeId: string): string {
  return createHash('sha256')
    .update(JSON.stringify([runId, nodeId, 'execute']))
    .digest('hex');
}
@Injectable()
export class RunsRepository {
  readonly leaseMs: number;
  private recoveryCursor: string | undefined;
  constructor(
    readonly prisma: PrismaService,
    readonly compiler: WorkflowCompiler,
  ) {
    this.leaseMs = Number(process.env.RUN_LEASE_MS ?? 15000);
    if (
      !Number.isInteger(this.leaseMs) ||
      this.leaseMs < 1000 ||
      this.leaseMs > 120000
    )
      throw new Error('Invalid RUN_LEASE_MS');
  }
  private async now(tx: Tx): Promise<Date> {
    const rows = await tx.$queryRawUnsafe<{ now: Date }[]>(
      'SELECT clock_timestamp() AS now',
    );
    return rows[0].now;
  }
  private async locked<T>(
    id: string,
    action: (tx: Tx, run: FlowRun, now: Date) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
          'SELECT id FROM "FlowRun" WHERE id = $1::uuid FOR UPDATE',
          id,
        );
        if (!rows.length) throw new NotFoundException();
        return action(
          tx,
          await tx.flowRun.findUniqueOrThrow({ where: { id } }),
          await this.now(tx),
        );
      },
      { timeout: 20000 },
    );
  }
  private async member(
    tx: Tx,
    workspaceId: string,
    userId: string,
    roles?: string[],
  ): Promise<void> {
    const user = await tx.userEntity.findUnique({
      where: { id: BigInt(userId) },
    });
    const membership = await tx.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: BigInt(userId) } },
    });
    if (
      !user ||
      !user.isEnable ||
      user.isDeleted ||
      (user.lockoutEnabled &&
        user.lockoutEndDateUtc &&
        user.lockoutEndDateUtc > (await this.now(tx))) ||
      !membership ||
      (roles && !roles.includes(membership.role))
    )
      throw new ForbiddenException();
  }
  private async event(
    tx: Tx,
    runId: string,
    type: string,
    nodeId?: string,
    attemptId?: string,
    payload: Json = {},
  ): Promise<void> {
    const run = await tx.flowRun.update({
      where: { id: runId },
      data: { highWaterSeq: { increment: 1 } },
    });
    await tx.runEvent.create({
      data: {
        runId,
        seq: run.highWaterSeq,
        type,
        nodeId,
        attemptId,
        payload: dbJson(payload),
      },
    });
  }
  async publish(flowId: bigint, userId: string, value: unknown) {
    const graph = this.compiler.compile(value);
    return this.prisma.$transaction(async (tx) => {
      // Use the same identity lock as explicit private-workspace creation.
      // Different flows of one owner must not race nested workspace upserts.
      await tx.$queryRaw`SELECT id FROM "UserEntity" WHERE id = ${BigInt(userId)} FOR UPDATE`;
      await tx.$queryRawUnsafe(
        'SELECT id FROM "FlowEntity" WHERE id = $1 FOR UPDATE',
        flowId,
      );
      const flow = await tx.flowEntity.findFirst({
        where: { id: flowId, ownerUserId: BigInt(userId) },
      });
      if (!flow) throw new NotFoundException();
      const workspace = await tx.workspace.upsert({
        where: { ownerUserId: BigInt(userId) },
        create: {
          id: randomUUID(),
          ownerUserId: BigInt(userId),
          name: 'Private workspace',
          members: { create: { userId: BigInt(userId), role: 'Owner' } },
        },
        update: {},
      });
      await this.member(tx, workspace.id, userId, ['Owner', 'Editor']);
      const last = await tx.workflowVersion.findFirst({
        where: { sourceFlowId: flowId },
        orderBy: { number: 'desc' },
      });
      return tx.workflowVersion.create({
        data: {
          workspaceId: workspace.id,
          sourceFlowId: flowId,
          number: (last?.number ?? 0) + 1,
          publishedBy: BigInt(userId),
          graph: dbJson(graph as unknown as Json),
          hash: graphHash(graph),
        },
      });
    });
  }
  async disableVersion(versionId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT id FROM "WorkflowVersion" WHERE id = $1::uuid FOR UPDATE',
        versionId,
      );
      const version = await tx.workflowVersion.findUnique({
        where: { id: versionId },
      });
      if (!version) throw new NotFoundException();
      await this.member(tx, version.workspaceId, userId, ['Owner', 'Editor']);
      return tx.workflowVersion.update({
        where: { id: versionId },
        data: { disabledAt: await this.now(tx) },
      });
    });
  }
  async create(versionId: string, userId: string, input: unknown) {
    assertJson(input);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT id FROM "WorkflowVersion" WHERE id = $1::uuid FOR UPDATE',
        versionId,
      );
      const version = await tx.workflowVersion.findUnique({
        where: { id: versionId },
      });
      if (!version || version.disabledAt) throw new NotFoundException();
      await this.member(tx, version.workspaceId, userId, ['Owner', 'Operator']);
      const graph = this.compiler.compile(version.graph);
      this.compiler.validate(graph.inputSchema, input);
      const run = await tx.flowRun.create({
        data: {
          id: randomUUID(),
          versionId,
          workspaceId: version.workspaceId,
          initiatorUserId: BigInt(userId),
          input: dbJson(input),
        },
      });
      await tx.nodeRun.createMany({
        data: graph.nodes.map((node) => ({
          id: randomUUID(),
          runId: run.id,
          nodeId: node.id,
          kind: node.kind,
        })),
      });
      await tx.runEdge.createMany({
        data: graph.edges.map((edge) => ({
          runId: run.id,
          edgeId: edge.id,
          fromNodeId: edge.from,
          toNodeId: edge.to,
        })),
      });
      await this.event(tx, run.id, 'run.created', undefined, undefined, {
        versionId,
        versionHash: version.hash,
      });
      await this.reconcile(tx, run.id, graph, await this.now(tx));
      return { runId: run.id, status: 'queued' };
    });
  }
  async snapshot(runId: string, userId: string) {
    return this.locked(runId, async (tx, run) => {
      await this.member(tx, run.workspaceId, userId);
      return tx.flowRun.findUniqueOrThrow({
        where: { id: runId },
        include: {
          version: true,
          nodes: {
            orderBy: { createdAt: 'asc' },
            include: { attempts: { orderBy: { number: 'asc' } } },
          },
          operations: { orderBy: { createdAt: 'asc' } },
        },
      });
    });
  }
  async events(runId: string, userId: string, after: number) {
    if (!Number.isSafeInteger(after) || after < 0)
      throw new BadRequestException();
    return this.locked(runId, async (tx, run) => {
      await this.member(tx, run.workspaceId, userId);
      const events = await tx.runEvent.findMany({
        where: { runId, seq: { gt: after } },
        orderBy: { seq: 'asc' },
        take: 200,
      });
      return { events, highWaterSeq: run.highWaterSeq };
    });
  }
  private spec(graph: WorkflowGraph, node: NodeRun): NodeSpec {
    if (!node.parentNodeId)
      return graph.nodes.find((spec) => spec.id === node.nodeId)!;
    const parent = graph.nodes.find((spec) => spec.id === node.parentNodeId)!;
    const action = parent.config!.action as JsonObject;
    return {
      ...action,
      id: node.nodeId,
      inputBindings: {},
      onError: 'continue',
    } as unknown as NodeSpec;
  }
  private async graph(tx: Tx, run: FlowRun): Promise<WorkflowGraph> {
    const version = await tx.workflowVersion.findUniqueOrThrow({
      where: { id: run.versionId },
    });
    return this.compiler.compile(version.graph);
  }
  private async enqueue(tx: Tx, node: NodeRun, now: Date): Promise<void> {
    const updated = await tx.nodeRun.update({
      where: { id: node.id },
      data: {
        status: 'ready',
        retryAt: null,
        leaseUntil: null,
        workerId: null,
        dispatchGeneration: { increment: 1 },
        lastDispatchAt: now,
      },
    });
    await tx.runOutbox.create({
      data: {
        runId: node.runId,
        nodeId: node.nodeId,
        generation: updated.dispatchGeneration,
      },
    });
    await this.event(tx, node.runId, 'node.ready', node.nodeId);
  }
  private validClaim(
    node: NodeRun | null,
    claim: ClaimedNode,
    now: Date,
  ): node is NodeRun {
    return (
      !!node &&
      node.runId === claim.runId &&
      node.nodeId === claim.nodeId &&
      node.status === 'running' &&
      node.fencing === claim.fencing &&
      node.attemptCount === claim.attemptNumber &&
      !!node.leaseUntil &&
      node.leaseUntil > now
    );
  }
  private writeAction(spec: NodeSpec): boolean {
    return spec.kind === 'http' && spec.config?.method === 'POST';
  }
  private async expand(
    tx: Tx,
    node: NodeRun,
    spec: NodeSpec,
    inputs: JsonObject,
    now: Date,
  ): Promise<void> {
    const items = inputs.items;
    if (
      !Array.isArray(items) ||
      items.length > Number(spec.config!.maxItems ?? 100)
    )
      throw new ExecutionError('FOREACH_ITEMS_LIMIT');
    const action = spec.config!.action as JsonObject;
    const identities = items.map((item, index) => {
      const id =
        typeof spec.config!.itemIdPath === 'string'
          ? readPointer(item, spec.config!.itemIdPath)
          : String(index);
      if (
        (typeof id !== 'string' && typeof id !== 'number') ||
        String(id).length > 128
      )
        throw new ExecutionError('INVALID_ITEM_ID');
      return String(id);
    });
    if (new Set(identities).size !== identities.length)
      throw new ExecutionError('DUPLICATE_ITEM_ID');
    const nodeCount = await tx.nodeRun.count({ where: { runId: node.runId } });
    if (nodeCount + items.length > 5000)
      throw new ExecutionError('RUN_NODE_LIMIT');
    const children = items.map((item, index) => {
      const input = { item, index };
      this.compiler.validate(action.inputSchema as JsonObject, input);
      return {
        id: randomUUID(),
        runId: node.runId,
        nodeId:
          node.nodeId +
          '--' +
          createHash('sha256').update(identities[index]).digest('hex'),
        parentNodeId: node.nodeId,
        itemId: identities[index],
        itemIndex: index,
        kind: jsonString(action.kind),
        resolvedInputs: dbJson(input),
      };
    });
    await tx.nodeRun.createMany({ data: children });
    await tx.nodeRun.update({
      where: { id: node.id },
      data: {
        status: 'waiting_children',
        resolvedInputs: dbJson(inputs),
        startedAt: now,
      },
    });
    await this.event(
      tx,
      node.runId,
      'foreach.expanded',
      node.nodeId,
      undefined,
      { count: items.length },
    );
  }
  async claim(
    runId: string,
    nodeId: string,
    workerId: string,
  ): Promise<ClaimedNode | null> {
    return this.locked(runId, async (tx, run, now) => {
      if (
        RUN_TERMINAL.has(run.status) ||
        run.cancelRequestedAt ||
        run.errorCode === 'NODE_FAILED' ||
        run.status === 'needs_attention'
      )
        return null;
      try {
        await this.member(tx, run.workspaceId, run.initiatorUserId.toString(), [
          'Owner',
          'Operator',
        ]);
      } catch (error) {
        if (!(error instanceof ForbiddenException)) throw error;
        await tx.flowRun.update({
          where: { id: runId },
          data: {
            status: 'failed',
            errorCode: 'PERMISSION_REVOKED',
            finishedAt: now,
          },
        });
        await tx.nodeRun.updateMany({
          where: { runId, status: { in: ['pending', 'ready', 'retry_wait'] } },
          data: { status: 'cancelled', finishedAt: now },
        });
        await this.event(tx, runId, 'run.permission_revoked');
        return null;
      }
      const node = await tx.nodeRun.findUnique({
        where: { runId_nodeId: { runId, nodeId } },
      });
      if (!node || node.status !== 'ready') return null;
      const graph = await this.graph(tx, run);
      const spec = this.spec(graph, node);
      let inputs: JsonObject;
      try {
        if (node.parentNodeId) inputs = json(node.resolvedInputs) as JsonObject;
        else {
          const ancestors = await tx.nodeRun.findMany({
            where: {
              runId,
              parentNodeId: null,
              status: { in: ['succeeded', 'failed'] },
            },
          });
          const outputs = Object.fromEntries(
            ancestors.map((previous) => [
              previous.nodeId,
              previous.status === 'failed'
                ? { errorCode: previous.errorCode ?? 'NODE_FAILED' }
                : json(previous.output),
            ]),
          );
          inputs = resolveInputs(spec, json(run.input), outputs);
        }
        this.compiler.validate(spec.inputSchema, inputs);
        if (spec.kind === 'foreach') {
          await this.expand(tx, node, spec, inputs, now);
          await this.reconcile(tx, runId, graph, now);
          return null;
        }
      } catch (error) {
        if (!(error instanceof ExecutionError)) throw error;
        await tx.nodeRun.update({
          where: { id: node.id },
          data: { status: 'failed', errorCode: error.code, finishedAt: now },
        });
        await this.event(tx, runId, 'node.failed', nodeId, undefined, {
          errorCode: error.code,
        });
        await this.reconcile(tx, runId, graph, now);
        return null;
      }
      const key = operationKey(runId, nodeId);
      if (this.writeAction(spec)) {
        const requestHash = createHash('sha256')
          .update(canonicalJson({ config: spec.config!, inputs }))
          .digest('hex');
        const operation = await tx.externalOperation.findUnique({
          where: { operationKey: key },
        });
        if (
          operation &&
          (operation.status !== 'pending' ||
            operation.requestHash !== requestHash)
        ) {
          await tx.nodeRun.update({
            where: { id: node.id },
            data: { status: 'unknown', errorCode: 'EXTERNAL_RESULT_UNKNOWN' },
          });
          await this.reconcile(tx, runId, graph, now);
          return null;
        }
        if (operation)
          await tx.externalOperation.update({
            where: { id: operation.id },
            data: { status: 'executing' },
          });
        else
          await tx.externalOperation.create({
            data: {
              runId,
              nodeRunId: node.id,
              operationKey: key,
              requestHash,
              target: jsonString(spec.config!.url),
              status: 'executing',
            },
          });
      }
      const leaseUntil = new Date(now.getTime() + this.leaseMs);
      const updated = await tx.nodeRun.update({
        where: { id: node.id },
        data: {
          status: 'running',
          attemptCount: { increment: 1 },
          fencing: { increment: 1 },
          resolvedInputs: dbJson(inputs),
          workerId,
          leaseUntil,
          startedAt: node.startedAt ?? now,
          errorCode: null,
        },
      });
      const attempt = await tx.nodeAttempt.create({
        data: {
          nodeRunId: node.id,
          number: updated.attemptCount,
          fencing: updated.fencing,
          workerId,
          status: 'running',
          input: dbJson(inputs),
          startedAt: now,
        },
      });
      if (run.status === 'queued') {
        await tx.flowRun.update({
          where: { id: runId },
          data: { status: 'running', startedAt: now },
        });
        await this.event(tx, runId, 'run.started');
      }
      await this.event(tx, runId, 'node.started', nodeId, attempt.id);
      return {
        runId,
        nodeRunId: node.id,
        nodeId,
        attemptId: attempt.id,
        attemptNumber: updated.attemptCount,
        fencing: updated.fencing,
        leaseUntil,
        spec,
        inputs,
        operationKey: key,
      };
    });
  }
  async heartbeat(claim: ClaimedNode): Promise<boolean> {
    return this.locked(claim.runId, async (tx, run, now) => {
      const node = await tx.nodeRun.findUnique({
        where: { id: claim.nodeRunId },
      });
      if (
        !this.validClaim(node, claim, now) ||
        RUN_TERMINAL.has(run.status) ||
        run.cancelRequestedAt
      )
        return false;
      try {
        await this.member(tx, run.workspaceId, run.initiatorUserId.toString(), [
          'Owner',
          'Operator',
        ]);
      } catch (error) {
        if (error instanceof ForbiddenException) return false;
        throw error;
      }
      await tx.nodeRun.update({
        where: { id: node.id },
        data: { leaseUntil: new Date(now.getTime() + this.leaseMs) },
      });
      return true;
    });
  }
  async complete(claim: ClaimedNode, output: Json): Promise<boolean> {
    return this.locked(claim.runId, async (tx, run, now) => {
      const node = await tx.nodeRun.findUnique({
        where: { id: claim.nodeRunId },
      });
      if (!this.validClaim(node, claim, now)) return false;
      this.compiler.validate(claim.spec.outputSchema, output);
      if (this.writeAction(claim.spec))
        await tx.externalOperation.update({
          where: { operationKey: claim.operationKey },
          data: { status: 'succeeded', result: dbJson(output) },
        });
      const cancelled = !!run.cancelRequestedAt || RUN_TERMINAL.has(run.status);
      await tx.nodeRun.update({
        where: { id: node.id },
        data: {
          status: cancelled ? 'cancelled' : 'succeeded',
          output: dbJson(output),
          leaseUntil: null,
          workerId: null,
          finishedAt: now,
        },
      });
      await tx.nodeAttempt.updateMany({
        where: {
          id: claim.attemptId,
          nodeRunId: node.id,
          fencing: claim.fencing,
          status: 'running',
        },
        data: {
          status: cancelled ? 'cancelled' : 'succeeded',
          output: dbJson(output),
          finishedAt: now,
        },
      });
      await this.event(
        tx,
        run.id,
        cancelled ? 'node.cancelled' : 'node.succeeded',
        node.nodeId,
        claim.attemptId,
      );
      await this.reconcile(tx, run.id, await this.graph(tx, run), now);
      return !cancelled;
    });
  }
  private async failure(
    tx: Tx,
    run: FlowRun,
    node: NodeRun,
    spec: NodeSpec,
    error: ExecutionError,
    now: Date,
  ): Promise<void> {
    const uncertain = this.writeAction(spec) && error.uncertain;
    const cancelled = !!run.cancelRequestedAt || RUN_TERMINAL.has(run.status);
    const retry =
      !uncertain &&
      !cancelled &&
      error.retryable &&
      node.attemptCount < (spec.maxAttempts ?? 1);
    const status = uncertain
      ? 'unknown'
      : cancelled
        ? 'cancelled'
        : retry
          ? 'retry_wait'
          : 'failed';
    await tx.nodeRun.update({
      where: { id: node.id },
      data: {
        status,
        errorCode: error.code,
        retryAt: retry
          ? new Date(
              now.getTime() +
                Math.min(30000, 500 * 2 ** Math.max(0, node.attemptCount - 1)),
            )
          : null,
        leaseUntil: null,
        workerId: null,
        finishedAt: retry ? null : now,
        fencing: { increment: 1 },
      },
    });
    await tx.nodeAttempt.updateMany({
      where: {
        nodeRunId: node.id,
        number: node.attemptCount,
        status: 'running',
      },
      data: {
        status: retry ? 'failed' : status,
        errorCode: error.code,
        finishedAt: now,
      },
    });
    if (this.writeAction(spec))
      await tx.externalOperation.updateMany({
        where: { nodeRunId: node.id, status: 'executing' },
        data: {
          status: uncertain ? 'unknown' : 'failed',
          errorCode: error.code,
        },
      });
    await this.event(tx, run.id, 'node.' + status, node.nodeId, undefined, {
      errorCode: error.code,
    });
  }
  async fail(claim: ClaimedNode, error: ExecutionError): Promise<boolean> {
    return this.locked(claim.runId, async (tx, run, now) => {
      const node = await tx.nodeRun.findUnique({
        where: { id: claim.nodeRunId },
      });
      if (!this.validClaim(node, claim, now)) return false;
      await this.failure(tx, run, node, claim.spec, error, now);
      await this.reconcile(tx, run.id, await this.graph(tx, run), now);
      return !RUN_TERMINAL.has(run.status) && !run.cancelRequestedAt;
    });
  }
  async cancel(runId: string, userId: string) {
    return this.locked(runId, async (tx, run, now) => {
      await this.member(tx, run.workspaceId, userId, ['Owner', 'Operator']);
      if (!RUN_TERMINAL.has(run.status) && !run.cancelRequestedAt) {
        await tx.flowRun.update({
          where: { id: runId },
          data: { cancelRequestedAt: now, status: 'cancelling' },
        });
        await this.event(tx, runId, 'run.cancel_requested');
      }
      await this.reconcile(tx, runId, await this.graph(tx, run), now);
      return tx.flowRun.findUniqueOrThrow({ where: { id: runId } });
    });
  }
  async recover(limit = 100): Promise<void> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
      throw new Error('Invalid recovery batch limit');
    const runs = await this.prisma.flowRun.findMany({
      where: {
        ...(this.recoveryCursor ? { id: { gt: this.recoveryCursor } } : {}),
        OR: [
          {
            status: {
              in: ['queued', 'running', 'cancelling', 'needs_attention'],
            },
          },
          { nodes: { some: { status: 'running' } } },
        ],
      },
      orderBy: { id: 'asc' },
      take: limit,
    });
    this.recoveryCursor =
      runs.length === limit ? runs[runs.length - 1].id : undefined;
    for (const candidate of runs)
      await this.locked(candidate.id, async (tx, run, now) => {
        const graph = await this.graph(tx, run);
        const nodes = await tx.nodeRun.findMany({ where: { runId: run.id } });
        for (const node of nodes) {
          const spec = this.spec(graph, node);
          if (
            node.status === 'running' &&
            node.leaseUntil &&
            node.leaseUntil <= now
          )
            await this.failure(
              tx,
              run,
              node,
              spec,
              new ExecutionError('LEASE_EXPIRED', true, this.writeAction(spec)),
              now,
            );
          else if (
            node.status === 'retry_wait' &&
            node.retryAt &&
            node.retryAt <= now &&
            !run.cancelRequestedAt &&
            !RUN_TERMINAL.has(run.status)
          )
            await this.enqueue(tx, node, now);
          else if (
            node.status === 'ready' &&
            (!node.lastDispatchAt ||
              node.lastDispatchAt.getTime() < now.getTime() - 5000) &&
            !run.cancelRequestedAt &&
            !RUN_TERMINAL.has(run.status) &&
            run.status !== 'needs_attention'
          )
            await this.enqueue(tx, node, now);
        }
        await this.reconcile(tx, run.id, graph, now);
      });
  }
  async resolveOperation(
    runId: string,
    id: string,
    userId: string,
    decision: 'succeeded' | 'not_executed',
    reason: string,
    output?: Json,
  ) {
    if (
      reason.trim().length < 10 ||
      !['succeeded', 'not_executed'].includes(decision)
    )
      throw new BadRequestException();
    return this.locked(runId, async (tx, run, now) => {
      await this.member(tx, run.workspaceId, userId, ['Owner']);
      const operation = await tx.externalOperation.findFirst({
        where: { id, runId, status: 'unknown' },
      });
      if (!operation || RUN_TERMINAL.has(run.status))
        throw new BadRequestException();
      const node = await tx.nodeRun.findUniqueOrThrow({
        where: { id: operation.nodeRunId },
      });
      const graph = await this.graph(tx, run);
      if (decision === 'succeeded') {
        if (output === undefined) throw new BadRequestException();
        this.compiler.validate(this.spec(graph, node).outputSchema, output);
        await tx.externalOperation.update({
          where: { id },
          data: {
            status: 'succeeded',
            result: dbJson(output),
            resolutionReason: reason,
            resolvedBy: BigInt(userId),
          },
        });
        await tx.nodeRun.update({
          where: { id: node.id },
          data: {
            status: 'succeeded',
            output: dbJson(output),
            errorCode: null,
            finishedAt: now,
          },
        });
      } else {
        if (run.cancelRequestedAt)
          throw new BadRequestException('Cancelled writes cannot be retried');
        await tx.externalOperation.update({
          where: { id },
          data: {
            status: 'pending',
            errorCode: null,
            resolutionReason: reason,
            resolvedBy: BigInt(userId),
          },
        });
        await this.enqueue(tx, node, now);
      }
      await this.event(
        tx,
        run.id,
        'operation.resolved',
        node.nodeId,
        undefined,
        { operationId: id, decision, reason, resolvedBy: userId },
      );
      if (!(await tx.nodeRun.count({ where: { runId, status: 'unknown' } })))
        await tx.flowRun.update({
          where: { id: runId },
          data: { status: 'running', errorCode: null },
        });
      await this.reconcile(tx, runId, graph, now);
      return tx.externalOperation.findUniqueOrThrow({ where: { id } });
    });
  }
  private async reconcile(
    tx: Tx,
    runId: string,
    graph: WorkflowGraph,
    now: Date,
  ): Promise<void> {
    const run = await tx.flowRun.findUniqueOrThrow({ where: { id: runId } });
    if (RUN_TERMINAL.has(run.status)) return;
    let nodes = await tx.nodeRun.findMany({ where: { runId } });
    if (nodes.some((node) => node.status === 'unknown')) {
      if (run.status !== 'needs_attention') {
        await tx.flowRun.update({
          where: { id: runId },
          data: {
            status: 'needs_attention',
            errorCode: 'EXTERNAL_RESULT_UNKNOWN',
          },
        });
        await this.event(tx, runId, 'run.needs_attention');
      }
      return;
    }
    if (run.cancelRequestedAt) {
      await tx.nodeRun.updateMany({
        where: {
          runId,
          status: {
            in: ['pending', 'ready', 'retry_wait', 'waiting_children'],
          },
        },
        data: { status: 'cancelled', finishedAt: now },
      });
      if (!nodes.some((node) => node.status === 'running')) {
        await tx.flowRun.update({
          where: { id: runId },
          data: { status: 'cancelled', finishedAt: now },
        });
        await this.event(tx, runId, 'run.cancelled');
      }
      return;
    }
    for (const parent of nodes.filter(
      (node) => node.status === 'waiting_children',
    )) {
      const children = nodes
        .filter((node) => node.parentNodeId === parent.nodeId)
        .sort((a, b) => a.itemIndex! - b.itemIndex!);
      const parentSpec = this.spec(graph, parent);
      if (children.every((child) => NODE_TERMINAL.has(child.status))) {
        const failed =
          children.some((child) => child.status === 'failed') &&
          parentSpec.config!.failurePolicy === 'fail';
        const output: Json = {
          items: children.map((child) => ({
            itemId: child.itemId!,
            status: child.status,
            ...(child.status === 'succeeded'
              ? { output: json(child.output) }
              : {}),
            ...(child.errorCode ? { errorCode: child.errorCode } : {}),
          })),
        };
        try {
          this.compiler.validate(parentSpec.outputSchema, output);
        } catch {
          await tx.nodeRun.update({
            where: { id: parent.id },
            data: {
              status: 'failed',
              errorCode: 'OUTPUT_SCHEMA',
              finishedAt: now,
            },
          });
          continue;
        }
        await tx.nodeRun.update({
          where: { id: parent.id },
          data: {
            status: failed ? 'failed' : 'succeeded',
            output: dbJson(output),
            errorCode: failed ? 'FOREACH_ITEM_FAILED' : null,
            finishedAt: now,
          },
        });
        await this.event(
          tx,
          runId,
          failed ? 'node.failed' : 'node.succeeded',
          parent.nodeId,
        );
      } else {
        const running = children.filter((child) =>
          ['running', 'ready'].includes(child.status),
        ).length;
        const slots = Number(parentSpec.config!.concurrency ?? 4) - running;
        for (const child of children
          .filter((child) => child.status === 'pending')
          .slice(0, Math.max(0, slots)))
          await this.enqueue(tx, child, now);
      }
    }
    nodes = await tx.nodeRun.findMany({ where: { runId } });
    const roots = nodes.filter((node) => !node.parentNodeId);
    if (
      roots.some(
        (node) =>
          node.status === 'failed' &&
          this.spec(graph, node).onError !== 'continue',
      )
    ) {
      await tx.nodeRun.updateMany({
        where: {
          runId,
          status: {
            in: ['pending', 'ready', 'retry_wait', 'waiting_children'],
          },
        },
        data: { status: 'cancelled', finishedAt: now },
      });
      if (nodes.some((node) => node.status === 'running')) {
        // Do not close the human-verification path while a write is in flight.
        // Known completions remain recorded; lost replies become needs_attention.
        await tx.flowRun.update({
          where: { id: runId },
          data: { status: 'running', errorCode: 'NODE_FAILED' },
        });
        if (run.errorCode !== 'NODE_FAILED')
          await this.event(tx, runId, 'run.draining');
        return;
      }
      await tx.flowRun.update({
        where: { id: runId },
        data: { status: 'failed', errorCode: 'NODE_FAILED', finishedAt: now },
      });
      await this.event(tx, runId, 'run.failed');
      return;
    }
    const edges = await tx.runEdge.findMany({ where: { runId } });
    const plan = planDag(
      graph,
      Object.fromEntries(
        roots.map((node) => [
          node.nodeId,
          {
            status: node.status,
            output: node.output === null ? undefined : json(node.output),
          },
        ]),
      ),
      Object.fromEntries(
        edges.map((edge) => [
          edge.edgeId,
          edge.status as 'unresolved' | 'active' | 'inactive',
        ]),
      ),
    );
    for (const edge of plan.edges)
      await tx.runEdge.update({
        where: { runId_edgeId: { runId, edgeId: edge.id } },
        data: { status: edge.status },
      });
    for (const nodeId of plan.skipped) {
      await tx.nodeRun.update({
        where: { runId_nodeId: { runId, nodeId } },
        data: { status: 'skipped', finishedAt: now },
      });
      await this.event(tx, runId, 'node.skipped', nodeId);
    }
    for (const nodeId of plan.ready)
      await this.enqueue(
        tx,
        roots.find((node) => node.nodeId === nodeId)!,
        now,
      );
    const after = await tx.nodeRun.findMany({
      where: { runId, parentNodeId: null },
    });
    if (after.every((node) => NODE_TERMINAL.has(node.status))) {
      await tx.flowRun.update({
        where: { id: runId },
        data: { status: 'succeeded', finishedAt: now },
      });
      await this.event(tx, runId, 'run.succeeded');
    }
  }
}
