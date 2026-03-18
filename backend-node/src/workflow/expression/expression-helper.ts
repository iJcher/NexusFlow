import { FlowRuntimeContext } from '../types';
import { FlowRuntime } from '../nodes/node-base';
import * as vm from 'vm';

export async function computeExpression(
  expressionUnit: any,
  context: FlowRuntimeContext,
  runtime: FlowRuntime,
): Promise<any> {
  if (!expressionUnit) return null;
  const typeName = expressionUnit.typeName;

  const textValue = expressionUnit.text ?? expressionUnit.Text ?? '';

  switch (typeName) {
    case 'FullTextExpressionUnit':
    case 'FullTextMiniExpressionUnit':
      return replacePlaceholders(context, runtime, textValue);

    case 'JSExpressionUnit':
      return executeJSExpression(expressionUnit, context, runtime);

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
    result = result.replace(placeholder, String(value ?? ''));
  }
  return result;
}

async function resolvePlaceholder(
  content: string,
  context: FlowRuntimeContext,
  runtime: FlowRuntime,
): Promise<any> {
  if (content.startsWith('sys.')) {
    return resolveSystemVariable(content, context);
  }
  if (content.includes('.')) {
    return resolveNodeOutput(content, context, runtime);
  }
  return resolveVariable(content, context);
}

function resolveSystemVariable(sysVar: string, context: FlowRuntimeContext): any {
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

export function resolveVariable(varName: string, context: FlowRuntimeContext): any {
  const v =
    context.variables?.find((v) => v.name.toLowerCase() === varName.toLowerCase()) ??
    context.inputVariables?.find((v) => v.name.toLowerCase() === varName.toLowerCase());
  if (!v) return null;
  return v.hasValue ? v.value : v.defaultValue ?? null;
}

async function resolveNodeOutput(
  reference: string,
  context: FlowRuntimeContext,
  runtime: FlowRuntime,
): Promise<any> {
  const parts = reference.split('.', 2);
  if (parts.length < 2) return null;

  const nodeId = parts[0].trim();
  const jsonPath = parts[1].trim();

  const targetNode = context.flowConfigInfoForRun?.nodes?.find((n) => n.id === nodeId);
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

export function extractByJsonPath(source: any, path: string): any {
  if (!source) return null;
  const parts = path.split('.');
  let current = source;
  for (const part of parts) {
    if (current == null) return null;
    if (typeof current === 'object' && part in current) {
      current = current[part];
    } else if (Array.isArray(current)) {
      const idx = parseInt(part, 10);
      if (!isNaN(idx) && idx >= 0 && idx < current.length) {
        current = current[idx];
      } else {
        return null;
      }
    } else {
      return null;
    }
  }
  return current;
}

async function executeJSExpression(
  unit: any,
  context: FlowRuntimeContext,
  runtime: FlowRuntime,
): Promise<any> {
  const isFunctionMode = unit.isFunctionMode ?? false;
  const code = isFunctionMode ? unit.functionCode : unit.expressionCode;
  if (!code) throw new Error('JS code is empty');

  const placeholderMap = new Map<string, { varName: string; value: any }>();
  const regex = /\{\{([^}]+)\}\}/g;
  const matches = [...code.matchAll(regex)];

  for (const match of matches) {
    const placeholder = match[0];
    const content = match[1].trim();
    if (placeholderMap.has(placeholder)) continue;

    const varName = content.replace(/\./g, '_');
    const value = await resolvePlaceholder(content, context, runtime);
    placeholderMap.set(placeholder, { varName, value });
  }

  let processedCode = code;
  for (const [placeholder, info] of placeholderMap) {
    processedCode = processedCode.split(placeholder).join(info.varName);
  }

  const sandbox: Record<string, any> = {};
  for (const [, info] of placeholderMap) {
    sandbox[info.varName] = info.value;
  }

  const vmContext = vm.createContext(sandbox);

  if (isFunctionMode) {
    const wrapped = processedCode + '\nmain();';
    return vm.runInContext(wrapped, vmContext, { timeout: 5000 });
  } else {
    return vm.runInContext(processedCode, vmContext, { timeout: 5000 });
  }
}
