export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export type Binding =
  | { source: 'literal'; value: Json }
  | { source: 'runInput'; path: string; optional?: boolean; default?: Json }
  | {
      source: 'node';
      nodeId: string;
      path: string;
      optional?: boolean;
      default?: Json;
    };
export type NodeKind =
  | 'start'
  | 'constant'
  | 'transform'
  | 'condition'
  | 'merge'
  | 'delay'
  | 'foreach'
  | 'http'
  | 'js';
export interface ActionSpec {
  kind: 'transform' | 'delay' | 'http';
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  config?: JsonObject;
  timeoutMs?: number;
  maxAttempts?: number;
}
export interface NodeSpec {
  id: string;
  kind: NodeKind;
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  inputBindings: Record<string, Binding>;
  config?: JsonObject;
  timeoutMs?: number;
  maxAttempts?: number;
  onError?: 'fail' | 'continue';
}
export interface EdgeSpec {
  id: string;
  from: string;
  to: string;
  branch?: boolean;
}
export interface WorkflowGraph {
  schemaVersion: 1;
  inputSchema: JsonObject;
  nodes: NodeSpec[];
  edges: EdgeSpec[];
}
export const NODE_TERMINAL = new Set([
  'succeeded',
  'failed',
  'skipped',
  'cancelled',
  'unknown',
]);
export const RUN_TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);
export interface ExecutionContext {
  runId: string;
  nodeId: string;
  attemptId: string;
  attemptNumber: number;
  fencing: number;
  operationKey: string;
  signal: AbortSignal;
}
export class ExecutionError extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false,
    readonly uncertain = false,
  ) {
    super(code);
  }
}
export function jsonString(value: Json | undefined): string {
  if (typeof value !== 'string')
    throw new ExecutionError('CONFIG_STRING_REQUIRED');
  return value;
}
export function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function jsonClone<T extends Json>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
export function assertJson(
  value: unknown,
  maxBytes = 262144,
): asserts value is Json {
  const encoded = JSON.stringify(value);
  if (encoded === undefined || Buffer.byteLength(encoded) > maxBytes)
    throw new ExecutionError('JSON_SIZE');
  const walk = (v: unknown, depth: number): void => {
    if (depth > 32) throw new ExecutionError('JSON_DEPTH');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number' && Number.isFinite(v)) return;
    if (Array.isArray(v)) {
      v.forEach((x) => walk(x, depth + 1));
      return;
    }
    if (isObject(v)) {
      for (const [key, item] of Object.entries(v)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key))
          throw new ExecutionError('UNSAFE_KEY');
        walk(item, depth + 1);
      }
      return;
    }
    throw new ExecutionError('INVALID_JSON');
  };
  walk(value, 0);
}
