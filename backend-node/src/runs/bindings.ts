import {
  ExecutionError,
  Json,
  JsonObject,
  NodeSpec,
  jsonClone,
  isObject,
} from './contracts';

export function pointerTokens(path: string): string[] {
  if (path === '') return [];
  if (!path.startsWith('/') || /~(?:[^01]|$)/.test(path))
    throw new ExecutionError('INVALID_POINTER');
  return path
    .slice(1)
    .split('/')
    .map((part) => {
      const token = part.replace(/~1/g, '/').replace(/~0/g, '~');
      if (['__proto__', 'constructor', 'prototype'].includes(token))
        throw new ExecutionError('UNSAFE_POINTER');
      return token;
    });
}
export function readPointer(value: Json, path: string): Json | undefined {
  let current: Json | undefined = value;
  for (const token of pointerTokens(path)) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(token)) return undefined;
      current = current[Number(token)];
    } else if (isObject(current) && Object.hasOwn(current, token)) {
      current = current[token];
    } else return undefined;
  }
  return current;
}
export function resolveInputs(
  node: NodeSpec,
  runInput: Json,
  outputs: Record<string, Json>,
): JsonObject {
  const result: JsonObject = {};
  for (const [key, binding] of Object.entries(node.inputBindings)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key))
      throw new ExecutionError('UNSAFE_BINDING');
    let value: Json | undefined;
    if (binding.source === 'literal') value = binding.value;
    else if (binding.source === 'runInput')
      value = readPointer(runInput, binding.path);
    else if (Object.hasOwn(outputs, binding.nodeId))
      value = readPointer(outputs[binding.nodeId], binding.path);
    if (value === undefined && binding.source !== 'literal' && binding.optional)
      value = binding.default;
    if (value === undefined) {
      if (binding.source !== 'literal' && binding.optional) continue;
      throw new ExecutionError('MISSING_BINDING');
    }
    result[key] = jsonClone(value);
  }
  return result;
}
