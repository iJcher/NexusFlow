import { WorkflowCompiler } from '../../src/runs/compiler';
import { readPointer, resolveInputs } from '../../src/runs/bindings';
import { planDag } from '../../src/runs/scheduler';
import {
  Binding,
  Json,
  JsonObject,
  NodeSpec,
  WorkflowGraph,
} from '../../src/runs/contracts';

// A deliberate scheduler defect exists only in this test process. The exact same
// legal diamond assertions must detect a Join released before all inputs resolve.
jest.mock('../../src/runs/scheduler', () => {
  const actual = jest.requireActual<typeof import('../../src/runs/scheduler')>(
    '../../src/runs/scheduler',
  );
  if (process.env.P02_NEGATIVE_CONTROL !== 'early-join') return actual;
  return {
    ...actual,
    planDag: (...args: Parameters<typeof actual.planDag>) => {
      const result = actual.planDag(...args);
      if (args[0].nodes.some((item) => item.id === 'join'))
        result.ready.push('join');
      return result;
    },
  };
});

const objectSchema: JsonObject = {
  type: 'object',
  properties: {},
  additionalProperties: true,
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function node(
  id: string,
  kind: NodeSpec['kind'] = 'merge',
  bindings: Record<string, Binding> = {},
): NodeSpec {
  return {
    id,
    kind,
    inputSchema: clone(objectSchema),
    outputSchema: clone(objectSchema),
    inputBindings: bindings,
  };
}
function graph(
  nodes: NodeSpec[],
  connections: [string, string, boolean?][],
): WorkflowGraph {
  return {
    schemaVersion: 1,
    inputSchema: clone(objectSchema),
    nodes,
    edges: connections.map(([from, to, branch], i) => ({
      id: 'e' + i,
      from,
      to,
      ...(branch === undefined ? {} : { branch }),
    })),
  };
}
function diamond(): WorkflowGraph {
  return graph(
    [node('start', 'start'), node('left'), node('right'), node('join')],
    [
      ['start', 'left'],
      ['start', 'right'],
      ['left', 'join'],
      ['right', 'join'],
    ],
  );
}
function branchGraph(): WorkflowGraph {
  const condition = node('choose', 'condition');
  condition.config = { path: '/accepted', operator: 'truthy' };
  condition.outputSchema = {
    type: 'object',
    properties: { matched: { type: 'boolean' } },
    required: ['matched'],
  };
  return graph(
    [
      node('start', 'start'),
      condition,
      node('yes'),
      node('no'),
      node('join'),
      node('tail'),
    ],
    [
      ['start', 'choose'],
      ['choose', 'yes', true],
      ['choose', 'no', false],
      ['yes', 'join'],
      ['no', 'join'],
      ['join', 'tail'],
    ],
  );
}
type NodeStates = Record<string, { status: string; output?: Json }>;
type EdgeStates = Record<string, 'unresolved' | 'active' | 'inactive'>;

describe('P02-01 deterministic DAG scheduling', () => {
  test('starts only the unique start, then releases both parallel children', () => {
    const g = diamond();
    expect(planDag(g, {}, {}).ready).toEqual(['start']);
    const result = planDag(
      g,
      { start: { status: 'succeeded', output: {} } },
      {},
    );
    expect(result.ready.sort()).toEqual(['left', 'right']);
    expect(result.skipped).toEqual([]);
    expect(result.edges).toEqual([
      { id: 'e0', status: 'active' },
      { id: 'e1', status: 'active' },
    ]);
  });
  test.each([
    ['left', 'right'],
    ['right', 'left'],
  ])('join does not run early when %s finishes before %s', (first, second) => {
    const states: NodeStates = {
      start: { status: 'succeeded' },
      [first]: { status: 'succeeded' },
      [second]: { status: 'running' },
    };
    expect(planDag(diamond(), states, {}).ready).not.toContain('join');
    states[second] = { status: 'succeeded' };
    expect(planDag(diamond(), states, {}).ready).toEqual(['join']);
  });
  test.each([true, false])(
    'condition %s activates one edge and skip resolves the unchosen branch',
    (matched) => {
      const result = planDag(
        branchGraph(),
        {
          start: { status: 'succeeded' },
          choose: { status: 'succeeded', output: { matched } },
        },
        {},
      );
      expect(result.ready).toEqual([matched ? 'yes' : 'no']);
      expect(result.skipped).toEqual([matched ? 'no' : 'yes']);
      expect(result.edges).toEqual(
        expect.arrayContaining([
          { id: matched ? 'e1' : 'e2', status: 'active' },
          { id: matched ? 'e2' : 'e1', status: 'inactive' },
          { id: matched ? 'e4' : 'e3', status: 'inactive' },
        ]),
      );
      expect(result.ready).not.toContain('join');
      const final = planDag(
        branchGraph(),
        {
          start: { status: 'succeeded' },
          choose: { status: 'succeeded', output: { matched } },
          [matched ? 'yes' : 'no']: { status: 'succeeded' },
          [matched ? 'no' : 'yes']: { status: 'skipped' },
        },
        {},
      );
      expect(final.ready).toEqual(['join']);
    },
  );
  test('no activated input skips the full downstream chain in one fixed-point plan', () => {
    const g = graph(
      [node('start', 'start'), node('a'), node('b'), node('c')],
      [
        ['start', 'a'],
        ['a', 'b'],
        ['b', 'c'],
      ],
    );
    const result = planDag(g, { start: { status: 'skipped' } }, {});
    expect(result.ready).toEqual([]);
    expect(result.skipped).toEqual(['a', 'b', 'c']);
    expect(result.edges).toHaveLength(3);
    expect(result.edges.every((edge) => edge.status === 'inactive')).toBe(true);
  });
  test.each(['running', 'retry_wait', 'ready', 'unknown'])(
    'a %s predecessor leaves its edge unresolved',
    (status) => {
      const result = planDag(
        graph([node('start', 'start'), node('a')], [['start', 'a']]),
        { start: { status } },
        {},
      );
      expect(result).toEqual({ ready: [], skipped: [], edges: [] });
    },
  );
  test('already resolved edge cannot be changed by a contradictory late output', () => {
    const edges: EdgeStates = { e0: 'active', e1: 'inactive', e2: 'active' };
    const result = planDag(
      branchGraph(),
      {
        start: { status: 'succeeded' },
        choose: { status: 'succeeded', output: { matched: true } },
      },
      edges,
    );
    expect(result.ready).toEqual(['no']);
    expect(result.skipped).toEqual(['yes']);
    expect(result.edges.find((edge) => edge.id === 'e1')).toBeUndefined();
    expect(edges).toEqual({ e0: 'active', e1: 'inactive', e2: 'active' });
  });
  test('continue failure activates its edge; fail policy inactivates it', () => {
    const g = graph(
      [node('start', 'start'), node('next')],
      [['start', 'next']],
    );
    expect(planDag(g, { start: { status: 'failed' } }, {}).skipped).toEqual([
      'next',
    ]);
    g.nodes[0].onError = 'continue';
    expect(planDag(g, { start: { status: 'failed' } }, {}).ready).toEqual([
      'next',
    ]);
  });
  test('ready/running/terminal nodes are never scheduled a second time and input states are unchanged', () => {
    const states: NodeStates = {
      start: { status: 'succeeded' },
      left: { status: 'ready' },
      right: { status: 'running' },
      join: { status: 'cancelled' },
    };
    const before = clone(states);
    expect(planDag(diamond(), states, {}).ready).toEqual([]);
    expect(states).toEqual(before);
  });
});

describe('P02-02 binding isolation and JSON Pointer', () => {
  test('escaped slash/tilde, empty property, array index and whole root', () => {
    const value: Json = { 'a/b': { '~x': [17] }, '': false, nil: null };
    expect(readPointer(value, '/a~1b/~0x/0')).toBe(17);
    expect(readPointer(value, '/')).toBe(false);
    expect(readPointer(value, '/nil')).toBeNull();
    expect(readPointer(value, '')).toEqual(value);
    expect(readPointer(value, '/a~1b/~0x/01')).toBeUndefined();
    expect(readPointer(value, '/absent/a')).toBeUndefined();
  });
  test.each([
    'a',
    '/bad~',
    '/bad~2',
    '/__proto__',
    '/constructor/x',
    '/prototype',
  ])('invalid or unsafe pointer %s is rejected', (path) => {
    expect(() => readPointer({}, path)).toThrow();
  });
  test('required missing source fails; optional absent omitted; explicit null not replaced', () => {
    const n = node('n', 'merge', {
      x: { source: 'node', nodeId: 'previous', path: '/x' },
    });
    expect(() => resolveInputs(n, {}, {})).toThrow();
    n.inputBindings = {
      absent: { source: 'runInput', path: '/absent', optional: true },
      present: {
        source: 'runInput',
        path: '/nil',
        optional: true,
        default: 'fallback',
      },
    };
    expect(resolveInputs(n, { nil: null }, {})).toEqual({ present: null });
  });
  test('literal, run input, predecessor output and defaults are deep copies independent across runs', () => {
    const runInput: Json = { values: [1] };
    const outputs: Record<string, Json> = {
      previous: { nested: { count: 2 } },
    };
    const n = node('n', 'merge', {
      literal: { source: 'literal', value: { a: [3] } },
      values: { source: 'runInput', path: '/values' },
      predecessor: { source: 'node', nodeId: 'previous', path: '/nested' },
      fallback: {
        source: 'node',
        nodeId: 'skipped',
        path: '',
        optional: true,
        default: { count: 4 },
      },
    });
    const first = resolveInputs(n, runInput, outputs);
    (first.values as Json[]).push(99);
    (first.predecessor as JsonObject).count = 99;
    (first.fallback as JsonObject).count = 99;
    ((first.literal as JsonObject).a as Json[]).push(99);
    expect(resolveInputs(n, runInput, outputs)).toEqual({
      literal: { a: [3] },
      values: [1],
      predecessor: { count: 2 },
      fallback: { count: 4 },
    });
    expect(
      resolveInputs(n, { values: [7] }, { previous: { nested: { count: 8 } } })
        .values,
    ).toEqual([7]);
  });
  test('prototype properties are not predecessor outputs', () => {
    const n = node('n', 'merge', {
      x: { source: 'node', nodeId: 'previous', path: '/x' },
    });
    const outputs = Object.create({ previous: { x: 1 } }) as Record<
      string,
      Json
    >;
    expect(() => resolveInputs(n, {}, outputs)).toThrow();
  });
});

describe('P02 compiler publication validation', () => {
  const compiler = new WorkflowCompiler();
  test('accepts the legal diamond and conditioned graph', () => {
    expect(compiler.compile(diamond()).nodes).toHaveLength(4);
    expect(compiler.compile(branchGraph()).nodes).toHaveLength(6);
  });
  test('node cap accepts exactly 200 and rejects 201; edge cap rejects 1001', () => {
    const nodes = Array.from({ length: 200 }, (_, i) =>
      node('n' + i, i === 0 ? 'start' : 'merge'),
    );
    const connections: [string, string][] = nodes
      .slice(1)
      .map((_, i) => ['n' + i, 'n' + (i + 1)]);
    const boundedGraph = graph(nodes, connections);
    expect(compiler.compile(boundedGraph).nodes).toHaveLength(200);
    const oversized = clone(boundedGraph);
    oversized.nodes.push(node('n200'));
    oversized.edges.push({ id: 'last', from: 'n199', to: 'n200' });
    expect(() => compiler.compile(oversized)).toThrow();
    const tooManyEdges = diamond();
    tooManyEdges.edges = Array.from({ length: 1001 }, (_, i) => ({
      id: 'edge' + i,
      from: 'start',
      to: 'left',
    }));
    expect(() => compiler.compile(tooManyEdges)).toThrow();
  });
  test.each([
    'cycle',
    'unreachable',
    'duplicate-node',
    'duplicate-edge',
    'missing-start',
    'second-start',
    'self-loop',
    'missing-endpoint',
  ])('rejects graph fault %s', (fault) => {
    const g = diamond();
    if (fault === 'cycle')
      g.edges.push({ id: 'cycle', from: 'join', to: 'left' });
    if (fault === 'unreachable') g.nodes.push(node('orphan'));
    if (fault === 'duplicate-node') g.nodes.push(clone(g.nodes[1]));
    if (fault === 'duplicate-edge') g.edges.push(clone(g.edges[0]));
    if (fault === 'missing-start') g.nodes[0].kind = 'merge';
    if (fault === 'second-start') g.nodes[1].kind = 'start';
    if (fault === 'self-loop')
      g.edges.push({ id: 'self', from: 'join', to: 'join' });
    if (fault === 'missing-endpoint') g.edges[0].to = 'absent';
    expect(() => compiler.compile(g)).toThrow();
  });
  test('rejects sibling/self/future bindings even if a node exists', () => {
    for (const source of ['right', 'left', 'join', 'absent']) {
      const g = diamond();
      g.nodes[1].inputBindings = {
        value: { source: 'node', nodeId: source, path: '', optional: true },
      };
      expect(() => compiler.compile(g)).toThrow();
    }
  });
  test('ancestor and run input typed bindings accepted; mismatched source types rejected', () => {
    const g = diamond();
    g.nodes[1].outputSchema = {
      type: 'object',
      properties: { value: { type: 'number' } },
      required: ['value'],
    };
    g.nodes[3].inputSchema = {
      type: 'object',
      properties: { value: { type: 'number' } },
      required: ['value'],
      additionalProperties: false,
    };
    g.nodes[3].inputBindings = {
      value: { source: 'node', nodeId: 'left', path: '/value' },
    };
    expect(() => compiler.compile(g)).not.toThrow();
    g.nodes[1].outputSchema = {
      type: 'object',
      properties: { value: { type: 'string' } },
    };
    expect(() => compiler.compile(g)).toThrow();
  });
  test('array element schema mismatch is rejected at publication, not deferred until after executing a predecessor', () => {
    const g = diamond();
    g.inputSchema = {
      type: 'object',
      properties: { list: { type: 'array', items: { type: 'string' } } },
    };
    g.nodes[1].inputSchema = {
      type: 'object',
      properties: { list: { type: 'array', items: { type: 'number' } } },
      required: ['list'],
    };
    g.nodes[1].inputBindings = { list: { source: 'runInput', path: '/list' } };
    expect(() => compiler.compile(g)).toThrow();
  });
  test('required bindings cannot be omitted; unknown property and invalid default/literal are rejected', () => {
    const g = graph([node('start', 'start')], []);
    g.nodes[0].inputSchema = {
      type: 'object',
      properties: { count: { type: 'number' } },
      required: ['count'],
      additionalProperties: false,
    };
    expect(() => compiler.compile(g)).toThrow();
    g.nodes[0].inputBindings = { count: { source: 'literal', value: 'text' } };
    expect(() => compiler.compile(g)).toThrow();
    g.nodes[0].inputBindings = {
      count: {
        source: 'runInput',
        path: '/missing',
        optional: true,
        default: 'text',
      },
    };
    expect(() => compiler.compile(g)).toThrow();
    g.nodes[0].inputBindings = {
      count: { source: 'literal', value: 1 },
      extra: { source: 'literal', value: 1 },
    };
    expect(() => compiler.compile(g)).toThrow();
  });
  test('explicit required input cannot resolve to absent optional binding with no default', () => {
    const g = graph([node('start', 'start')], []);
    g.nodes[0].inputSchema = {
      type: 'object',
      properties: { requiredValue: { type: 'number' } },
      required: ['requiredValue'],
    };
    g.nodes[0].inputBindings = {
      requiredValue: { source: 'runInput', path: '/missing', optional: true },
    };
    expect(() => compiler.compile(g)).toThrow();
  });
  test('rejects JS, unknown fields, remote schema references and malformed condition branches', () => {
    const valid = graph([node('start', 'start')], []);
    expect(() =>
      compiler.compile({
        ...valid,
        nodes: [{ ...valid.nodes[0], kind: 'js' }],
      }),
    ).toThrow();
    expect(() =>
      compiler.compile({
        ...valid,
        nodes: [{ ...valid.nodes[0], script: 'while(true){}' }],
      }),
    ).toThrow();
    expect(() =>
      compiler.compile({
        ...valid,
        inputSchema: { $ref: 'https://example.test/schema' },
      }),
    ).toThrow();
    const conditional = branchGraph();
    delete conditional.edges[1].branch;
    expect(() => compiler.compile(conditional)).toThrow();
    const ordinary = diamond();
    ordinary.edges[0].branch = true;
    expect(() => compiler.compile(ordinary)).toThrow();
  });
  test.each([
    { timeoutMs: 99 },
    { timeoutMs: 120001 },
    { maxAttempts: 0 },
    { maxAttempts: 6 },
    { timeoutMs: 100.5 },
  ])('rejects node limit %j', (limits) => {
    const g = graph([{ ...node('start', 'start'), ...limits }], []);
    expect(() => compiler.compile(g)).toThrow();
  });
  test('runtime schema validation rejects wrong types, required missing fields, extra fields and non JSON numbers', () => {
    const schema: JsonObject = {
      type: 'object',
      properties: { count: { type: 'integer', minimum: 0 } },
      required: ['count'],
      additionalProperties: false,
    };
    expect(() => compiler.validate(schema, { count: 0 })).not.toThrow();
    for (const value of [
      {},
      { count: '1' },
      { count: -1 },
      { count: 1, extra: true },
      { count: NaN },
      { count: Infinity },
    ])
      expect(() => compiler.validate(schema, value)).toThrow();
  });
  test.each([0, 1001, 1.5])('rejects foreach maxItems %s', (maxItems) => {
    const g = foreachGraph();
    g.nodes[1].config!.maxItems = maxItems;
    expect(() => compiler.compile(g)).toThrow();
  });
  test.each([0, 33, 1.5])('rejects foreach concurrency %s', (concurrency) => {
    const g = foreachGraph();
    g.nodes[1].config!.concurrency = concurrency;
    expect(() => compiler.compile(g)).toThrow();
  });
  test('accepts inclusive foreach limits and rejects unbounded/nested/JS actions and invalid item path', () => {
    const g = foreachGraph();
    g.nodes[1].config!.maxItems = 1000;
    g.nodes[1].config!.concurrency = 32;
    expect(() => compiler.compile(g)).not.toThrow();
    for (const kind of ['foreach', 'js', 'unknown']) {
      const invalid = clone(g);
      (invalid.nodes[1].config!.action as JsonObject).kind = kind;
      expect(() => compiler.compile(invalid)).toThrow();
    }
    g.nodes[1].config!.itemIdPath = '/bad~2';
    expect(() => compiler.compile(g)).toThrow();
  });
});

function foreachGraph(): WorkflowGraph {
  const each = node('each', 'foreach', {
    items: { source: 'literal', value: [] },
  });
  each.inputSchema = {
    type: 'object',
    properties: { items: { type: 'array', items: {} } },
    required: ['items'],
  };
  each.config = {
    maxItems: 10,
    concurrency: 2,
    failurePolicy: 'continue',
    action: {
      kind: 'transform',
      inputSchema: clone(objectSchema),
      outputSchema: clone(objectSchema),
      config: { operation: 'identity' },
    },
  };
  return graph([node('start', 'start'), each], [['start', 'each']]);
}
