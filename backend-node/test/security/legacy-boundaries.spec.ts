import { parseLegacyFlowConfig } from '../../src/workflow/legacy-config';
import {
  computeExpression,
  extractByJsonPath,
  replacePlaceholders,
} from '../../src/workflow/expression/expression-helper';
import {
  createSuccessResult,
  FlowRuntime,
} from '../../src/workflow/nodes/node-base';
import { FlowRuntimeContext } from '../../src/workflow/types';

function minimalConfig() {
  return {
    variables: [],
    inputParameters: [],
    nodes: [
      { id: 'start', typeName: 'StartNode' },
      { id: 'reply', typeName: 'ReplyNode' },
    ],
    lines: [{ id: 'line', fromNodeId: 'start', toNodeId: 'reply' }],
  };
}

function read(value: unknown) {
  return parseLegacyFlowConfig(JSON.stringify(value));
}

describe('P01 legacy configuration runtime boundaries (no database)', () => {
  it('accepts a minimal linked legacy workflow', () => {
    const input = minimalConfig();
    expect(read(input)).toEqual(input);
  });

  it('preserves compatible text/Text, condition, assignment and HTTP fields', () => {
    const node = {
      id: 'mixed',
      typeName: 'ConditionNode',
      systemPrompt: { typeName: 'FullTextExpressionUnit', Text: 'system' },
      userPrompt: { typeName: 'FullTextMiniExpressionUnit', text: 'user' },
      message: { typeName: 'FullTextMiniExpressionUnit', Text: '{{name}}' },
      conditions: [
        {
          id: 'rule',
          description: 'historical condition metadata',
          lineId: 'branch',
          expressionUnit: {
            typeName: 'JSExpressionUnit',
            functionCode: '',
            expressionCode: '{{age}} > 18',
            isFunctionMode: false,
          },
        },
      ],
      elseRule: { id: 'else', lineId: 'fallback' },
      assignments: [
        {
          targetVariableName: 'answer',
          expressionUnit: {
            typeName: 'FullTextMiniExpressionUnit',
            Text: 'ok',
          },
        },
      ],
      queryParams: [{ enabled: true, key: 'page', value: '1' }],
      headerParams: [{ enabled: false, key: 'X-Request', value: 'workflow' }],
      url: { typeName: 'FullTextExpressionUnit', Text: 'https://example.test' },
      body: '{"status":"ok"}',
      knowledgeBaseIds: ['1', '2'],
    };
    expect(
      read({ ...minimalConfig(), nodes: [node], lines: [] }).nodes,
    ).toEqual([node]);
  });

  it('preserves arbitrary JSON variable values without silently coercing them', () => {
    const variables = [
      {
        typeName: 'ObjectVariable',
        name: 'payload',
        hasValue: true,
        value: { items: [null, false, 0, 'x'] },
        defaultValue: { enabled: true },
      },
    ];
    expect(read({ ...minimalConfig(), variables }).variables).toEqual(
      variables,
    );
  });

  it.each([null, [], 'flow', 17])('rejects non-object root %j', (root) => {
    expect(() => read(root)).toThrow('LEGACY_CONFIG_OBJECT_REQUIRED');
  });

  it.each(['variables', 'inputParameters', 'nodes', 'lines'])(
    'rejects an object where %s must be an array',
    (key) => {
      expect(() => read({ ...minimalConfig(), [key]: {} })).toThrow(
        'LEGACY_CONFIG_ARRAY_REQUIRED',
      );
    },
  );

  it.each([
    { id: 1 },
    { typeName: false },
    { temperature: '0.5' },
    { enableThinking: 'true' },
    { message: { Text: 7 } },
    { systemPrompt: [] },
    { conditions: {} },
    { conditions: [{ lineId: 1 }] },
    { elseRule: { expressionUnit: { text: false } } },
    { assignments: [{ expressionUnit: { Text: 'ok' } }] },
    { assignments: [{ targetVariableName: false }] },
    { queryParams: [{ enabled: 'true' }] },
    { headerParams: [{ key: 7 }] },
    { knowledgeBaseIds: [1] },
    { timeoutSeconds: false },
  ])('rejects malformed known node fields %j', (fields) => {
    expect(() =>
      read({
        ...minimalConfig(),
        nodes: [{ id: 'single', typeName: 'ReplyNode', ...fields }],
        lines: [],
      }),
    ).toThrow();
  });

  it.each([
    { typeName: 'StringVariable', name: 7 },
    { typeName: 7, name: 'name' },
    { typeName: 'StringVariable', name: 'name', required: 'yes' },
  ])('rejects malformed variable metadata %j', (variable) => {
    expect(() => read({ ...minimalConfig(), variables: [variable] })).toThrow();
  });

  it.each(['__proto__', 'constructor', 'prototype'])(
    'rejects dangerous key %s anywhere in nested JSON',
    (key) => {
      // Computed own key remains in JSON; object-literal __proto__ would not.
      const value = { ...minimalConfig(), extra: { nested: { [key]: 'bad' } } };
      expect(() => read(value)).toThrow('UNSAFE_KEY');
    },
  );

  it('rejects oversized persisted JSON instead of allocating unbounded runtime data', () => {
    expect(() =>
      read({ ...minimalConfig(), extra: 'x'.repeat(262145) }),
    ).toThrow('JSON_SIZE');
  });

  it('rejects nested payload beyond the JSON depth limit', () => {
    let nested: unknown = 'leaf';
    for (let i = 0; i < 35; i++) nested = { child: nested };
    expect(() => read({ ...minimalConfig(), extra: nested })).toThrow(
      'JSON_DEPTH',
    );
  });

  it('rejects duplicate node identifiers', () => {
    expect(() =>
      read({
        ...minimalConfig(),
        nodes: [
          { id: 'same', typeName: 'StartNode' },
          { id: 'same', typeName: 'ReplyNode' },
        ],
        lines: [],
      }),
    ).toThrow('LEGACY_CONFIG_DUPLICATE_ID');
  });

  it('rejects duplicate line identifiers and references to missing nodes', () => {
    const input = minimalConfig();
    expect(() =>
      read({ ...input, lines: [input.lines[0], input.lines[0]] }),
    ).toThrow('LEGACY_CONFIG_DUPLICATE_ID');
    expect(() =>
      read({ ...input, lines: [{ ...input.lines[0], toNodeId: 'absent' }] }),
    ).toThrow('LEGACY_CONFIG_MISSING_NODE');
  });
});

describe('P01 expression placeholder and own-property runtime boundaries', () => {
  const context: FlowRuntimeContext = {
    flowId: 1n,
    flowInstanceId: 2n,
    ownerUserId: 'owner',
    user: 'user',
    displayName: 'test',
    startTime: new Date('2026-01-01'),
    flowConfigInfoForRun: {
      variables: [],
      inputParameters: [],
      nodes: [{ id: 'source', typeName: 'HttpNode' }],
      lines: [],
    },
    variables: [
      { typeName: 'StringVariable', name: 'name', defaultValue: 'Alice' },
    ],
    inputVariables: [],
    inputVariablesOriginal: {},
    request: { user: 'user', query: 'question' },
  };
  const output = {
    payload: { items: [{ name: 'first' }, { name: 'second' }] },
    falsy: { number: 0, boolean: false, string: '' },
  };
  const runtime: FlowRuntime = {
    currentNode: null,
    getNodeExecuteResult: jest.fn(() =>
      Promise.resolve(createSuccessResult('source', output)),
    ),
  };

  it('resolves an entire multi-level suffix rather than dropping later segments', async () => {
    expect(
      await replacePlaceholders(
        context,
        runtime,
        '{{source.payload.items.1.name}} / {{name}} / {{sys.query}}',
      ),
    ).toBe('second / Alice / question');
  });

  it.each(['text', 'Text'])(
    'executes compatible %s expression content at runtime',
    async (key) => {
      expect(
        await computeExpression(
          { typeName: 'FullTextMiniExpressionUnit', [key]: '{{name}}' },
          context,
          runtime,
        ),
      ).toBe('Alice');
    },
  );

  it('does not accidentally enable unsafe legacy JS expression execution', async () => {
    await expect(
      computeExpression(
        { typeName: 'JSExpressionUnit', text: '1 + 1' },
        context,
        runtime,
      ),
    ).rejects.toThrow('JS_EXECUTION_DISABLED_NO_ISOLATION');
  });

  it('preserves normal array indexes and falsy scalar values', () => {
    expect(extractByJsonPath(output, 'payload.items.0.name')).toBe('first');
    expect(extractByJsonPath(output, 'falsy.number')).toBe(0);
    expect(extractByJsonPath(output, 'falsy.boolean')).toBe(false);
    expect(extractByJsonPath(output, 'falsy.string')).toBe('');
  });

  it.each([
    '__proto__',
    'constructor',
    'prototype',
    'payload.__proto__.polluted',
    'payload.items.constructor',
    'payload.items.0.constructor',
  ])('does not expose a prototype traversal path %s', async (path) => {
    expect(extractByJsonPath(output, path)).toBeNull();
    expect(
      await replacePlaceholders(context, runtime, '{{source.' + path + '}}'),
    ).toBe('');
  });

  it('blocks inherited ordinary properties as well as explicit dangerous own keys', () => {
    const inherited: unknown = Object.create({ secret: 'prototype value' });
    expect(extractByJsonPath(inherited, 'secret')).toBeNull();
    const dangerous: unknown = JSON.parse('{"constructor":"own secret"}');
    expect(extractByJsonPath(dangerous, 'constructor')).toBeNull();
  });

  it('returns null for absent indexes, null intermediates and scalar traversal', () => {
    expect(extractByJsonPath(output, 'payload.items.99.name')).toBeNull();
    expect(extractByJsonPath({ value: null }, 'value.name')).toBeNull();
    expect(extractByJsonPath({ value: 'text' }, 'value.length')).toBeNull();
  });
});
