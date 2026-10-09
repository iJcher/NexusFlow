import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import Ajv, { type ValidateFunction } from 'ajv';
import {
  ExecutionError,
  Json,
  JsonObject,
  NodeSpec,
  WorkflowGraph,
  assertJson,
  isObject,
  jsonString,
} from './contracts';
import { pointerTokens } from './bindings';

const kinds = new Set([
  'start',
  'constant',
  'transform',
  'condition',
  'merge',
  'delay',
  'foreach',
  'http',
  'js',
]);
const safeId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const schemaKeys = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'description',
  'title',
]);
function reject(code: string): never {
  throw new ExecutionError(code);
}
function record(value: unknown): JsonObject {
  if (!isObject(value)) reject('INVALID_OBJECT');
  return value;
}
function identifier(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !safeId.test(value) ||
    ['constructor', 'prototype'].includes(value)
  )
    reject('INVALID_ID');
  return value;
}
function bounded(
  value: Json | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined) return fallback;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    reject('INVALID_LIMIT');
  return value;
}
export function canonicalJson(value: Json): string {
  if (Array.isArray(value))
    return '[' + value.map(canonicalJson).join(',') + ']';
  if (isObject(value))
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export function graphHash(graph: WorkflowGraph): string {
  return createHash('sha256')
    .update(canonicalJson(graph as unknown as Json))
    .digest('hex');
}
@Injectable()
export class WorkflowCompiler {
  private readonly validators = new Map<string, ValidateFunction>();
  private readonly ajv = new Ajv({
    strict: true,
    allErrors: false,
    ownProperties: true,
    allowUnionTypes: true,
  });
  validate(schema: JsonObject, value: unknown): void {
    const validate = this.checkSchema(schema);
    assertJson(value, 1048576);
    if (!validate(value)) reject('SCHEMA_MISMATCH');
  }
  private checkSchema(schema: JsonObject): ValidateFunction {
    const key = canonicalJson(schema);
    const cached = this.validators.get(key);
    if (cached) return cached;
    const inspect = (part: JsonObject): void => {
      for (const key of Object.keys(part))
        if (!schemaKeys.has(key)) reject('UNSUPPORTED_SCHEMA_KEY');
      if (isObject(part.properties))
        for (const child of Object.values(part.properties))
          inspect(record(child));
      if (part.items !== undefined) inspect(record(part.items));
      if (isObject(part.additionalProperties))
        inspect(part.additionalProperties);
    };
    inspect(record(schema));
    if (!this.ajv.validateSchema(schema)) reject('INVALID_SCHEMA');
    try {
      const validate = this.ajv.compile(schema);
      this.ajv.removeSchema(schema);
      this.validators.set(key, validate);
      if (this.validators.size > 512) {
        const oldest = this.validators.keys().next();
        if (!oldest.done) this.validators.delete(oldest.value);
      }
      return validate;
    } catch {
      reject('INVALID_SCHEMA');
    }
  }
  private schemaAt(schema: JsonObject, path: string): JsonObject | undefined {
    let current: JsonObject | undefined = schema;
    for (const token of pointerTokens(path)) {
      if (!current) return undefined;
      if (current.type === 'array' && /^(0|[1-9]\d*)$/.test(token))
        current = isObject(current.items) ? current.items : undefined;
      else
        current =
          isObject(current.properties) && isObject(current.properties[token])
            ? current.properties[token]
            : undefined;
    }
    return current;
  }
  private compatible(source: JsonObject, target: JsonObject): boolean {
    const sourceTypes = Array.isArray(source.type)
      ? source.type
      : source.type
        ? [source.type]
        : [];
    const targetTypes = Array.isArray(target.type)
      ? target.type
      : target.type
        ? [target.type]
        : [];
    if (
      targetTypes.length &&
      sourceTypes.some(
        (type) =>
          !targetTypes.includes(type) &&
          !(type === 'integer' && targetTypes.includes('number')),
      )
    )
      return false;
    if (
      isObject(source.items) &&
      isObject(target.items) &&
      !this.compatible(source.items, target.items)
    )
      return false;
    if (isObject(source.properties) && isObject(target.properties)) {
      for (const [key, expected] of Object.entries(target.properties)) {
        if (
          isObject(expected) &&
          isObject(source.properties[key]) &&
          !this.compatible(source.properties[key], expected)
        )
          return false;
      }
    }
    return true;
  }
  private checkNode(raw: JsonObject): NodeSpec {
    const allowed = new Set([
      'id',
      'kind',
      'inputSchema',
      'outputSchema',
      'inputBindings',
      'config',
      'timeoutMs',
      'maxAttempts',
      'onError',
    ]);
    if (Object.keys(raw).some((key) => !allowed.has(key)))
      reject('UNKNOWN_NODE_FIELD');
    const id = identifier(raw.id);
    if (typeof raw.kind !== 'string' || !kinds.has(raw.kind))
      reject('NODE_KIND_DISABLED');
    this.checkSchema(record(raw.inputSchema));
    this.checkSchema(record(raw.outputSchema));
    const bindings = record(raw.inputBindings);
    for (const [key, candidate] of Object.entries(bindings)) {
      identifier(key);
      const binding = record(candidate);
      const keys =
        binding.source === 'literal'
          ? ['source', 'value']
          : binding.source === 'node'
            ? ['source', 'nodeId', 'path', 'optional', 'default']
            : ['source', 'path', 'optional', 'default'];
      if (Object.keys(binding).some((field) => !keys.includes(field)))
        reject('INVALID_BINDING');
      if (binding.source === 'literal') {
        if (!Object.hasOwn(binding, 'value')) reject('MISSING_LITERAL');
      } else {
        if (
          !['runInput', 'node'].includes(jsonString(binding.source)) ||
          typeof binding.path !== 'string'
        )
          reject('INVALID_BINDING');
        pointerTokens(binding.path);
        if (binding.source === 'node') identifier(binding.nodeId);
        if (
          binding.optional !== undefined &&
          typeof binding.optional !== 'boolean'
        )
          reject('INVALID_BINDING');
      }
    }
    const config = raw.config === undefined ? {} : record(raw.config);
    bounded(raw.timeoutMs, 30000, 100, 120000);
    bounded(raw.maxAttempts, 1, 1, 5);
    if (
      raw.onError !== undefined &&
      !['fail', 'continue'].includes(jsonString(raw.onError))
    )
      reject('INVALID_ERROR_POLICY');
    if (raw.kind === 'constant' && !Object.hasOwn(config, 'value'))
      reject('INVALID_CONSTANT');
    if (
      raw.kind === 'transform' &&
      !['identity', 'sum', 'concat', 'sha256'].includes(
        jsonString(config.operation),
      )
    )
      reject('INVALID_TRANSFORM');
    if (raw.kind === 'condition') {
      if (
        typeof config.path !== 'string' ||
        !['eq', 'neq', 'gte', 'truthy'].includes(jsonString(config.operator))
      )
        reject('INVALID_CONDITION');
      pointerTokens(config.path);
      if (config.operator !== 'truthy' && !Object.hasOwn(config, 'value'))
        reject('INVALID_CONDITION');
    }
    if (raw.kind === 'delay') bounded(config.milliseconds, 0, 0, 120000);
    if (raw.kind === 'js') {
      if (process.env.WORKFLOW_JS_ENABLED !== 'true')
        reject('JS_ISOLATION_DISABLED');
      if (
        typeof config.code !== 'string' ||
        !config.code.length ||
        Buffer.byteLength(config.code) > 16384 ||
        Object.keys(config).some((key) => key !== 'code')
      )
        reject('INVALID_JS');
    }
    if (raw.kind === 'http') {
      if (
        typeof config.url !== 'string' ||
        !['GET', 'POST'].includes(jsonString(config.method))
      )
        reject('INVALID_HTTP');
      const url = new URL(config.url);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.hash ||
        (url.port && url.port !== '443')
      )
        reject('HTTP_POLICY');
      if (Object.keys(config).some((key) => !['url', 'method'].includes(key)))
        reject('HTTP_POLICY');
    }
    if (raw.kind === 'foreach') {
      bounded(config.maxItems, 100, 1, 1000);
      bounded(config.concurrency, 4, 1, 32);
      if (!['fail', 'continue'].includes(jsonString(config.failurePolicy)))
        reject('INVALID_FOREACH');
      if (config.itemIdPath !== undefined) {
        if (typeof config.itemIdPath !== 'string') reject('INVALID_FOREACH');
        pointerTokens(config.itemIdPath);
      }
      const action = record(config.action);
      if (!['transform', 'delay', 'http'].includes(jsonString(action.kind)))
        reject('INVALID_FOREACH_ACTION');
      this.checkNode({ ...action, id: 'item', inputBindings: {} });
    }
    return { ...raw, id, config } as unknown as NodeSpec;
  }
  compile(value: unknown): WorkflowGraph {
    assertJson(value);
    const raw = record(value);
    if (
      raw.schemaVersion !== 1 ||
      Object.keys(raw).some(
        (key) =>
          !['schemaVersion', 'inputSchema', 'nodes', 'edges'].includes(key),
      )
    )
      reject('INVALID_GRAPH');
    this.checkSchema(record(raw.inputSchema));
    if (
      !Array.isArray(raw.nodes) ||
      !raw.nodes.length ||
      raw.nodes.length > 200 ||
      !Array.isArray(raw.edges) ||
      raw.edges.length > 1000
    )
      reject('GRAPH_LIMIT');
    const nodes = raw.nodes.map((candidate) =>
      this.checkNode(record(candidate)),
    );
    const map = new Map(nodes.map((node) => [node.id, node]));
    if (
      map.size !== nodes.length ||
      nodes.filter((node) => node.kind === 'start').length !== 1
    )
      reject('DUPLICATE_OR_START');
    const edges = raw.edges.map((candidate) => {
      const edge = record(candidate);
      if (
        Object.keys(edge).some(
          (key) => !['id', 'from', 'to', 'branch'].includes(key),
        )
      )
        reject('INVALID_EDGE');
      const id = identifier(edge.id),
        from = identifier(edge.from),
        to = identifier(edge.to);
      if (!map.has(from) || !map.has(to) || from === to) reject('INVALID_EDGE');
      if (
        map.get(from)!.kind === 'condition'
          ? typeof edge.branch !== 'boolean'
          : edge.branch !== undefined
      )
        reject('INVALID_BRANCH');
      return {
        id,
        from,
        to,
        ...(edge.branch !== undefined
          ? { branch: edge.branch as boolean }
          : {}),
      };
    });
    if (new Set(edges.map((edge) => edge.id)).size !== edges.length)
      reject('DUPLICATE_EDGE');
    const ancestors = new Map<string, Set<string>>();
    const visiting = new Set<string>();
    const visit = (id: string): Set<string> => {
      if (visiting.has(id)) reject('GRAPH_CYCLE');
      if (ancestors.has(id)) return ancestors.get(id)!;
      visiting.add(id);
      const result = new Set<string>();
      for (const edge of edges.filter((edge) => edge.to === id)) {
        result.add(edge.from);
        for (const parent of visit(edge.from)) result.add(parent);
      }
      visiting.delete(id);
      ancestors.set(id, result);
      return result;
    };
    const start = nodes.find((node) => node.kind === 'start')!;
    for (const node of nodes) {
      const preceding = visit(node.id);
      if (node.id === start.id ? preceding.size > 0 : !preceding.has(start.id))
        reject('UNREACHABLE_NODE');
      const props = isObject(node.inputSchema.properties)
        ? node.inputSchema.properties
        : {};
      const required = Array.isArray(node.inputSchema.required)
        ? node.inputSchema.required
        : [];
      if (
        required.some(
          (key) =>
            typeof key !== 'string' || !Object.hasOwn(node.inputBindings, key),
        )
      )
        reject('MISSING_REQUIRED_BINDING');
      for (const [key, binding] of Object.entries(node.inputBindings)) {
        const expected = isObject(props[key]) ? props[key] : undefined;
        if (!expected && node.inputSchema.additionalProperties === false)
          reject('UNKNOWN_INPUT');
        if (binding.source === 'literal') {
          if (expected) this.validate(expected, binding.value);
          continue;
        }
        if (
          required.includes(key) &&
          binding.optional &&
          !Object.hasOwn(binding, 'default')
        )
          reject('MISSING_REQUIRED_DEFAULT');
        let schema: JsonObject;
        if (binding.source === 'node') {
          if (!preceding.has(binding.nodeId)) reject('NON_ANCESTOR_BINDING');
          schema = map.get(binding.nodeId)!.outputSchema;
        } else schema = record(raw.inputSchema);
        const source = this.schemaAt(schema, binding.path);
        if (!source && !binding.optional) reject('MISSING_SCHEMA_PATH');
        if (source && expected && !this.compatible(source, expected))
          reject('BINDING_TYPE_MISMATCH');
        if (binding.optional && Object.hasOwn(binding, 'default') && expected)
          this.validate(expected, binding.default);
      }
    }
    return {
      schemaVersion: 1,
      inputSchema: record(raw.inputSchema),
      nodes,
      edges,
    };
  }
}
