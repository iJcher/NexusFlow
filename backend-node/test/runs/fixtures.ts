import { randomUUID } from 'node:crypto';
import { spawn, ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { JsonObject, NodeSpec, WorkflowGraph } from '../../src/runs/contracts';

export const object: JsonObject = {
  type: 'object',
  additionalProperties: true,
};
export function node(
  id: string,
  kind: NodeSpec['kind'],
  extra: Partial<NodeSpec> = {},
): NodeSpec {
  return {
    id,
    kind,
    inputSchema: object,
    outputSchema: object,
    inputBindings: {},
    ...extra,
  };
}
export function graph(
  nodes: NodeSpec[],
  edges: WorkflowGraph['edges'] = [],
): WorkflowGraph {
  return { schemaVersion: 1, inputSchema: object, nodes, edges };
}
export function chain(...nodes: NodeSpec[]): WorkflowGraph {
  return graph(
    nodes,
    nodes.slice(1).map((item, index) => ({
      id: 'e' + index,
      from: nodes[index].id,
      to: item.id,
    })),
  );
}
export function testIdentity(): { id: bigint; name: string } {
  return {
    id: BigInt(
      '8' +
        Date.now().toString() +
        Math.floor(Math.random() * 1000)
          .toString()
          .padStart(3, '0'),
    ),
    name: 'p02-' + randomUUID(),
  };
}
export function isolated(): void {
  const database = new URL(process.env.DATABASE_URL || '');
  const redis = new URL(process.env.WORKFLOW_REDIS_URL || '');
  if (
    process.env.NODE_ENV !== 'test' ||
    database.hostname !== '127.0.0.1' ||
    database.port !== '15432' ||
    database.pathname !== '/nexus_test' ||
    redis.hostname !== '127.0.0.1' ||
    redis.port !== '16380' ||
    !/^nf-p02-[a-zA-Z0-9-]+$/.test(process.env.WORKFLOW_QUEUE_PREFIX || '')
  ) {
    throw new Error('BLOCKED: P02 refuses non-isolated database/Redis');
  }
}
export async function eventually<T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  timeout = 15000,
): Promise<T> {
  const deadline = Date.now() + timeout;
  let value: T;
  do {
    value = await read();
    if (accept(value)) return value;
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 40));
  } while (Date.now() < deadline);
  throw new Error('Timed out waiting for persisted acceptance state');
}
export function subprocess(
  file: string,
  env: Record<string, string> = {},
): ChildProcess {
  return spawn(
    process.execPath,
    ['-r', 'ts-node/register/transpile-only', resolve(__dirname, file)],
    {
      cwd: resolve(__dirname, '../..'),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
    },
  );
}
export async function message(
  child: ChildProcess,
  type: string,
  timeout = 15000,
): Promise<Record<string, unknown>> {
  return new Promise((resolveMessage, reject) => {
    const timer = setTimeout(
      () => done(new Error('Worker IPC timeout: ' + type)),
      timeout,
    );
    const onMessage = (value: Record<string, unknown>) => {
      if (value?.type === type) done(undefined, value);
    };
    const onExit = (code: number | null) =>
      done(new Error('Worker exited before ' + type + ': ' + code));
    const done = (error?: Error, value?: Record<string, unknown>) => {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('exit', onExit);
      if (error) reject(error);
      else resolveMessage(value!);
    };
    child.on('message', onMessage);
    child.on('exit', onExit);
  });
}
export async function kill(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolveExit) =>
    child.once('exit', () => resolveExit()),
  );
  child.kill('SIGKILL');
  await exited;
}
