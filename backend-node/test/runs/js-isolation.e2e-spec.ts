import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { ContainerJsExecutor } from '../../src/runs/container-js.executor';
import { WorkflowCompiler } from '../../src/runs/compiler';
import { HttpEffectExecutor } from '../../src/runs/http-effect.executor';
import { NodeRegistry } from '../../src/runs/node-registry';
import {
  ExecutionContext,
  JsonObject,
  NodeSpec,
} from '../../src/runs/contracts';

const cli = promisify(execFile);
const image =
  'node@sha256:d2166de198f26e17e5a442f537754dd616ab069c47cc57b889310a717e0abbf9';
const schema: JsonObject = { type: 'object', additionalProperties: true };
function spec(code: string, timeoutMs = 5000): NodeSpec {
  return {
    id: 'isolated',
    kind: 'js',
    inputSchema: schema,
    outputSchema: schema,
    inputBindings: {},
    config: { code },
    timeoutMs,
  };
}
function context(signal = new AbortController().signal): ExecutionContext {
  return {
    runId: randomUUID(),
    nodeId: 'isolated',
    attemptId: randomUUID(),
    attemptNumber: 1,
    fencing: 1,
    operationKey: randomUUID(),
    signal,
  };
}
async function containers(): Promise<string[]> {
  const result = await cli(
    'docker',
    [
      'ps',
      '-a',
      '--filter',
      'label=nexusflow.js-executor=true',
      '--format',
      '{{.Names}}',
    ],
    { timeout: 10000, windowsHide: true },
  );
  return result.stdout.trim().split(/\r?\n/).filter(Boolean);
}
async function until<T>(
  read: () => Promise<T>,
  good: (value: T) => boolean,
  timeoutMs = 4000,
): Promise<T> {
  const end = Date.now() + timeoutMs;
  let value = await read();
  while (!good(value) && Date.now() < end) {
    await new Promise<void>((resolve) => setTimeout(resolve, 40));
    value = await read();
  }
  if (!good(value))
    throw new Error('Expected Docker state not observed within test bound');
  return value;
}
interface Inspection {
  Config: { User: string; Env: string[] };
  HostConfig: {
    ReadonlyRootfs: boolean;
    NetworkMode: string;
    CapDrop: string[];
    SecurityOpt: string[];
    NanoCpus: number;
    Memory: number;
    MemorySwap: number;
    PidsLimit: number;
    Binds: null | string[];
    PidMode: string;
  };
  Mounts: unknown[];
}

describe('P02-08 real Docker JS isolation (not a full HTTP App availability test)', () => {
  const original = new Map<string, string | undefined>();
  let baseline: string[];
  let hostGateway: string;
  let executor: ContainerJsExecutor;
  beforeAll(async () => {
    for (const key of [
      'WORKFLOW_JS_ENABLED',
      'WORKFLOW_JS_IMAGE',
      'NEXUS_JS_TEST_SECRET',
    ])
      original.set(key, process.env[key]);
    process.env.WORKFLOW_JS_ENABLED = 'true';
    process.env.WORKFLOW_JS_IMAGE = image;
    process.env.NEXUS_JS_TEST_SECRET = 'host-only-' + randomUUID();
    await cli('docker', ['image', 'inspect', image], {
      timeout: 10000,
      windowsHide: true,
    });
    baseline = await containers();
    const gateway = await cli(
      'docker',
      [
        'network',
        'inspect',
        'bridge',
        '--format',
        '{{(index .IPAM.Config 0).Gateway}}',
      ],
      { timeout: 10000, windowsHide: true },
    );
    hostGateway = gateway.stdout.trim();
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostGateway))
      throw new Error('Expected actual Docker host bridge gateway');
  });
  beforeEach(() => {
    executor = new ContainerJsExecutor();
  });
  afterEach(async () => {
    process.env.WORKFLOW_JS_ENABLED = 'true';
    process.env.WORKFLOW_JS_IMAGE = image;
    await until(containers, (names) =>
      names.every((name) => baseline.includes(name)),
    );
  });
  afterAll(() => {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('P02-08 executes JSON in the cached digest-pinned image', async () => {
    await expect(
      executor.execute(
        spec('return {value: inputs.value + 1};'),
        { value: 41 },
        context(),
      ),
    ).resolves.toEqual({ value: 42 });
  });

  it('P02-08 cannot inherit worker secret, access host files/socket or write a read-only root', async () => {
    const code =
      "const fs = require('node:fs'); const denied = path => { try { fs.readFileSync(path); return false; } catch { return true; } }; let readonly = false; try { fs.writeFileSync('/tmp/nexus-test', 'x'); } catch(e) { readonly = ['EROFS','EACCES'].includes(e.code); } return {secretAbsent: process.env.NEXUS_JS_TEST_SECRET === undefined, socketDenied: denied('/var/run/docker.sock'), hostDenied: denied('D:/Code/NexusFlow/implementation/backend-node/.env'), readonly, uid: process.getuid()};";
    await expect(executor.execute(spec(code), {}, context())).resolves.toEqual({
      secretAbsent: true,
      socketDenied: true,
      hostDenied: true,
      readonly: true,
      uid: 65532,
    });
  });

  it('P02-08 actual running container has CPU/memory/pid/security limits and no host mounts', async () => {
    const abort = new AbortController();
    const execution = executor
      .execute(spec('while(true) {}'), {}, context(abort.signal))
      .catch((error: unknown) => error);
    try {
      const names = await until(containers, (items) =>
        items.some((name) => !baseline.includes(name)),
      );
      const own = names.find((name) => !baseline.includes(name))!;
      expect(own).toMatch(/^nf-js-[0-9a-f-]{36}$/);
      const result = await cli('docker', ['inspect', own], {
        timeout: 2000,
        windowsHide: true,
      });
      const [inspection] = JSON.parse(result.stdout) as Inspection[];
      expect(inspection.Config.User).toBe('65532:65532');
      expect(
        inspection.Config.Env.some((value) =>
          value.startsWith('NEXUS_JS_TEST_SECRET='),
        ),
      ).toBe(false);
      expect(inspection.HostConfig).toMatchObject({
        ReadonlyRootfs: true,
        NetworkMode: 'none',
        NanoCpus: 500000000,
        Memory: 134217728,
        MemorySwap: 134217728,
        PidsLimit: 32,
      });
      expect(inspection.HostConfig.CapDrop).toContain('ALL');
      expect(inspection.HostConfig.SecurityOpt).toContain('no-new-privileges');
      expect(inspection.HostConfig.Binds ?? []).toEqual([]);
      expect(inspection.HostConfig.PidMode).toBe('');
      expect(inspection.Mounts).toEqual([]);
    } finally {
      abort.abort();
    }
    expect(await execution).toMatchObject({ code: 'JS_ABORTED' });
  });

  it('P02-08 isolated container cannot reach host gateway or public IP', async () => {
    const code =
      "const net = require('node:net'); const denied = host => new Promise(resolve => { const socket = net.connect({host, port:443}); socket.setTimeout(600); socket.on('connect',()=>{socket.destroy();resolve(false);}); socket.on('error',()=>resolve(true)); socket.on('timeout',()=>{socket.destroy();resolve(true);}); }); return {hostDenied: await denied(inputs.hostGateway), publicDenied: await denied('1.1.1.1')};";
    await expect(
      executor.execute(spec(code), { hostGateway }, context()),
    ).resolves.toEqual({
      hostDenied: true,
      publicDenied: true,
    });
  });

  it('P02-08 infinite loop times out while host HTTP and a normal node remain healthy', async () => {
    const server = createServer((_request, response) =>
      response.end('healthy'),
    );
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const execution = executor
      .execute(spec('while(true) {}', 2000), {}, context())
      .catch((error: unknown) => error);
    try {
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Expected local test server');
      const response = await fetch('http://127.0.0.1:' + address.port);
      expect(await response.text()).toBe('healthy');
      const registry = new NodeRegistry(
        new WorkflowCompiler(),
        new HttpEffectExecutor(),
        executor,
      );
      await expect(
        registry.execute(
          { ...spec(''), kind: 'transform', config: { operation: 'sum' } },
          { values: [2, 3] },
          context(),
        ),
      ).resolves.toEqual({ value: 5 });
      expect(await execution).toMatchObject({ code: 'JS_TIMEOUT' });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('P02-08 memory exhaustion fails and removes only the owned container', async () => {
    // Prove startup succeeds first; a broken CLI command is not an OOM result.
    await expect(
      executor.execute(spec('return {started:true};'), {}, context()),
    ).resolves.toEqual({ started: true });
    await expect(
      executor.execute(
        spec(
          'const values=[]; while(true) { values.push(new Array(100000).fill(123456)); }',
        ),
        {},
        context(),
      ),
    ).rejects.toMatchObject({ code: 'JS_EXECUTION_FAILED' });
  });

  it('P02-08 excessive returned JSON and raw stdout are rejected', async () => {
    await expect(
      executor.execute(
        spec("return {value:'x'.repeat(70000)};"),
        {},
        context(),
      ),
    ).rejects.toMatchObject({ code: 'JS_OUTPUT_LIMIT' });
    await expect(
      executor.execute(
        spec("process.stdout.write('x'.repeat(100000)); return {};"),
        {},
        context(),
      ),
    ).rejects.toMatchObject({ code: 'JS_OUTPUT_LIMIT' });
  });

  it('P02-08 abort cancels execution and cleans up its exact container', async () => {
    const abort = new AbortController();
    const execution = executor
      .execute(spec('while(true) {}'), {}, context(abort.signal))
      .catch((error: unknown) => error);
    await until(containers, (items) =>
      items.some((name) => !baseline.includes(name)),
    );
    abort.abort();
    expect(await execution).toMatchObject({ code: 'JS_ABORTED' });
    await until(containers, (items) =>
      items.every((name) => baseline.includes(name)),
    );
  });

  it('P02-08 refuses a third execution instead of queuing unlimited containers', async () => {
    const abort = new AbortController();
    const pending = [
      executor
        .execute(spec('while(true) {}'), {}, context(abort.signal))
        .catch((error: unknown) => error),
      executor
        .execute(spec('while(true) {}'), {}, context(abort.signal))
        .catch((error: unknown) => error),
    ];
    try {
      await until(
        containers,
        (items) =>
          items.filter((name) => !baseline.includes(name)).length === 2,
      );
      await expect(
        executor.execute(spec('return {};'), {}, context()),
      ).rejects.toMatchObject({ code: 'JS_CAPACITY' });
    } finally {
      abort.abort();
      await Promise.all(pending);
    }
  });

  it('P02-08 disabled execution and missing/non-pinned images fail closed', async () => {
    delete process.env.WORKFLOW_JS_ENABLED;
    await expect(
      executor.execute(spec('return {};'), {}, context()),
    ).rejects.toMatchObject({ code: 'JS_ISOLATION_DISABLED' });
    process.env.WORKFLOW_JS_ENABLED = 'true';
    for (const invalid of [
      undefined,
      'node:22',
      'other@sha256:' + 'a'.repeat(64),
    ]) {
      if (invalid === undefined) delete process.env.WORKFLOW_JS_IMAGE;
      else process.env.WORKFLOW_JS_IMAGE = invalid;
      await expect(
        executor.execute(spec('return {};'), {}, context()),
      ).rejects.toMatchObject({ code: 'JS_ISOLATION_UNAVAILABLE' });
    }
  });

  it('P02-08 enforces input and submitted code limits before Docker starts', async () => {
    await expect(
      executor.execute(
        spec('return {};'),
        { value: 'x'.repeat(70000) },
        context(),
      ),
    ).rejects.toMatchObject({ code: 'JSON_SIZE' });
    await expect(
      executor.execute(spec(' '.repeat(17000)), {}, context()),
    ).rejects.toMatchObject({ code: 'JS_CODE_LIMIT' });
  });

  it('P02-08 compiler rejects JS by default and rejects caller-selected permissions when enabled', () => {
    const compiler = new WorkflowCompiler();
    const graph = {
      schemaVersion: 1,
      inputSchema: schema,
      nodes: [
        { ...spec(''), id: 'start', kind: 'start', config: {} },
        spec('return {};'),
      ],
      edges: [{ id: 'e', from: 'start', to: 'isolated' }],
    };
    delete process.env.WORKFLOW_JS_ENABLED;
    expect(() => compiler.compile(graph)).toThrow();
    process.env.WORKFLOW_JS_ENABLED = 'true';
    expect(() => compiler.compile(graph)).not.toThrow();
    for (const key of ['image', 'network', 'mounts', 'user', 'capabilities']) {
      const unsafe = {
        ...graph,
        nodes: [
          graph.nodes[0],
          {
            ...graph.nodes[1],
            config: { code: 'return {};', [key]: 'unsafe' },
          },
        ],
      };
      expect(() => compiler.compile(unsafe)).toThrow();
    }
  });
});
