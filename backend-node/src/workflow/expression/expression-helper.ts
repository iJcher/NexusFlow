import { ExpressionUnit, FlowRuntimeContext } from '../types';
import { FlowRuntime } from '../nodes/node-base';

export async function computeExpression(
  expressionUnit: ExpressionUnit | undefined,
  context: FlowRuntimeContext,
  runtime: FlowRuntime,
): Promise<string | null> {
  if (!expressionUnit) return null;
  const typeName = expressionUnit.typeName;

  const textValue = expressionUnit.text ?? expressionUnit.Text ?? '';

  switch (typeName) {
    case 'FullTextExpressionUnit':
    case 'FullTextMiniExpressionUnit':
      return replacePlaceholders(context, runtime, textValue);

    case 'JSExpressionUnit':
      throw new Error('JS_EXECUTION_DISABLED_NO_ISOLATION');

    default:
      if (textValue) {
        return replacePlaceholders(context, runtime, textValue);
      }
      return null;
  }
}

export async function replacePlaceholders(
  context: FlowRuntimeContext,
  runtime: FlowRuntime,
  text: string,
): Promise<string> {
  if (!text) return '';

  const regex = /\{\{([^}]+)\}\}/g;
  let result = text;
  const matches = [...text.matchAll(regex)];

  for (const match of matches) {
    const placeholder = match[0];
    const content = match[1].trim();
    const value = await resolvePlaceholder(content, context, runtime);
    result = result.replace(placeholder, expressionText(value));
  }
  return result;
}

export function expressionText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  )
    return String(value);
  throw new Error('INVALID_EXPRESSION_VALUE');
}

async function resolvePlaceholder(
  content: string,
  context: FlowRuntimeContext,
  runtime: FlowRuntime,
): Promise<unknown> {
  if (content.startsWith('sys.')) {
    return resolveSystemVariable(content, context);
  }
  if (content.includes('.')) {
    return resolveNodeOutput(content, context, runtime);
  }
  return resolveVariable(content, context);
}

function resolveSystemVariable(
  sysVar: string,
  context: FlowRuntimeContext,
): unknown {
  const prop = sysVar.substring(4);
  switch (prop) {
    case 'query':
      return context.request?.query ?? '';
    case 'user':
      return context.user;
    case 'flowId':
      return context.flowId.toString();
    case 'flowInstanceId':
      return context.flowInstanceId.toString();
    case 'dialogueCount':
      return context.dialogueCount ?? 0;
    case 'conversationId':
      return context.conversationId ?? '';
    case 'files':
      return context.request?.files ?? [];
    default:
      throw new Error(`Cannot resolve system variable: ${sysVar}`);
  }
}

export function resolveVariable(
  varName: string,
  context: FlowRuntimeContext,
): unknown {
  const v =
    context.variables?.find(
      (v) => v.name.toLowerCase() === varName.toLowerCase(),
    ) ??
    context.inputVariables?.find(
      (v) => v.name.toLowerCase() === varName.toLowerCase(),
    );
  if (!v) return null;
  return v.hasValue ? v.value : (v.defaultValue ?? null);
}

async function resolveNodeOutput(
  reference: string,
  context: FlowRuntimeContext,
  runtime: FlowRuntime,
): Promise<unknown> {
  const separator = reference.indexOf('.');
  const parts = [reference.slice(0, separator), reference.slice(separator + 1)];
  if (parts.length < 2) return null;

  const nodeId = parts[0].trim();
  const jsonPath = parts[1].trim();

  const targetNode = context.flowConfigInfoForRun?.nodes?.find(
    (n) => n.id === nodeId,
  );
  if (!targetNode) return `[node not found: ${nodeId}]`;

  const isLLMNode = targetNode.typeName === 'LLMNode';
  const isCurrentReply = runtime.currentNode?.typeName === 'ReplyNode';

  if (isCurrentReply && isLLMNode) {
    return `{{${reference}}}`;
  }

  const nodeResult = await runtime.getNodeExecuteResult(context, nodeId);
  if (!nodeResult) return `[node not executed: ${nodeId}]`;

  if (nodeResult.streamingExecutor) {
    let full = '';
    for await (const chunk of nodeResult.streamingExecutor()) {
      full += chunk;
    }
    return full;
  }

  return extractByJsonPath(nodeResult.result, jsonPath);
}

export function extractByJsonPath(source: unknown, path: string): unknown {
  if (source == null) return null;
  const parts = path.split('.');
  let current: unknown = source;
  for (const part of parts) {
    if (current == null) return null;
    if (
      ['__proto__', 'prototype', 'constructor'].includes(part) ||
      typeof current !== 'object' ||
      !Object.hasOwn(current, part)
    ) {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
