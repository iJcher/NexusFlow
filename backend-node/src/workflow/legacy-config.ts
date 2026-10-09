import { FlowConfigInfo, NodeConfig, NodeLine, Variable } from './types';
import { parseJson } from '../common/json.util';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('LEGACY_CONFIG_OBJECT_REQUIRED');
  return value as Record<string, unknown>;
}

function string(value: unknown): asserts value is string {
  if (typeof value !== 'string')
    throw new Error('LEGACY_CONFIG_STRING_REQUIRED');
}

function optionalFields(
  value: Record<string, unknown>,
  fields: string[],
  type: 'string' | 'boolean' | 'number',
) {
  for (const field of fields) {
    const item = value[field];
    if (item === undefined || item === null) continue;
    if (typeof item !== type || (type === 'number' && !Number.isFinite(item)))
      throw new Error('LEGACY_CONFIG_FIELD_TYPE');
  }
}

function expression(value: unknown) {
  const unit = object(value);
  optionalFields(unit, ['typeName', 'text', 'Text'], 'string');
}

function variable(value: unknown): Variable {
  const item = object(value);
  string(item.typeName);
  string(item.name);
  optionalFields(item, ['id'], 'string');
  optionalFields(item, ['required', 'hasValue'], 'boolean');
  return item as unknown as Variable;
}

function node(value: unknown): NodeConfig {
  const item = object(value);
  string(item.id);
  string(item.typeName);
  optionalFields(
    item,
    [
      'displayName',
      'description',
      'modelSelection',
      'modelName',
      'embeddingModel',
      'outputVariable',
      'method',
      'bodyMode',
    ],
    'string',
  );
  optionalFields(
    item,
    ['temperature', 'topK', 'threshold', 'timeoutSeconds'],
    'number',
  );
  optionalFields(item, ['enableThinking', 'rerankEnabled'], 'boolean');
  for (const field of [
    'systemPrompt',
    'userPrompt',
    'message',
    'queryExpression',
  ]) {
    if (item[field] != null) expression(item[field]);
  }
  for (const field of ['url', 'query', 'body', 'headers']) {
    if (item[field] != null && typeof item[field] !== 'string')
      expression(item[field]);
  }
  if (item.knowledgeBaseIds != null) {
    if (!Array.isArray(item.knowledgeBaseIds))
      throw new Error('LEGACY_CONFIG_ARRAY_REQUIRED');
    item.knowledgeBaseIds.forEach(string);
  }
  for (const field of [
    'conditions',
    'assignments',
    'queryParams',
    'headerParams',
  ]) {
    if (item[field] == null) continue;
    if (!Array.isArray(item[field]))
      throw new Error('LEGACY_CONFIG_ARRAY_REQUIRED');
    for (const entry of item[field]) {
      const rule = object(entry);
      optionalFields(
        rule,
        ['lineId', 'targetVariableName', 'key', 'value'],
        'string',
      );
      optionalFields(rule, ['enabled'], 'boolean');
      if (field === 'assignments') string(rule.targetVariableName);
      if (rule.expressionUnit != null) expression(rule.expressionUnit);
    }
  }
  if (item.elseRule != null) {
    const rule = object(item.elseRule);
    optionalFields(rule, ['lineId'], 'string');
    if (rule.expressionUnit != null) expression(rule.expressionUnit);
  }
  return item as unknown as NodeConfig;
}

function line(value: unknown): NodeLine {
  const item = object(value);
  string(item.id);
  string(item.fromNodeId);
  string(item.toNodeId);
  optionalFields(item, ['sourceAnchorId', 'targetAnchorId'], 'string');
  return item as unknown as NodeLine;
}

/** Validate persisted legacy data before the runtime trusts typed node fields. */
export function parseLegacyFlowConfig(text: string): FlowConfigInfo {
  const value = object(parseJson(text));
  function array<T>(key: string, decode: (entry: unknown) => T): T[] {
    const entries = value[key] ?? [];
    if (!Array.isArray(entries))
      throw new Error('LEGACY_CONFIG_ARRAY_REQUIRED');
    return entries.map(decode);
  }
  const config: FlowConfigInfo = {
    variables: array('variables', variable),
    inputParameters: array('inputParameters', variable),
    nodes: array('nodes', node),
    lines: array('lines', line),
  };
  const nodeIds = new Set(config.nodes.map((item) => item.id));
  const lineIds = new Set(config.lines.map((item) => item.id));
  if (
    nodeIds.size !== config.nodes.length ||
    lineIds.size !== config.lines.length
  )
    throw new Error('LEGACY_CONFIG_DUPLICATE_ID');
  if (
    config.lines.some(
      (item) => !nodeIds.has(item.fromNodeId) || !nodeIds.has(item.toNodeId),
    )
  )
    throw new Error('LEGACY_CONFIG_MISSING_NODE');
  return config;
}
