import { NodeConfig, FlowRuntimeContext, NodeExecuteResult } from '../types';
import { createSuccessResult, FlowRuntime } from './node-base';
import { computeExpression } from '../expression/expression-helper';

export async function executeReplyNode(
  node: NodeConfig,
  context: FlowRuntimeContext,
  runtime: FlowRuntime,
): Promise<NodeExecuteResult> {
  try {
    const text = (await computeExpression(node.message, context, runtime))?.toString() || '';

    const streamingExecutor = async function* (): AsyncGenerator<string> {
      yield* parseAndStreamText(text, context, runtime);
    };

    return createSuccessResult(node.id, { mode: 'streaming' }, streamingExecutor);
  } catch (e: any) {
    return { nodeId: node.id, isSuccess: false, errorMsg: `reply node failed: ${e.message}`, errorCode: 61002 };
  }
}

async function* parseAndStreamText(
  text: string,
  context: FlowRuntimeContext,
  runtime: FlowRuntime,
): AsyncGenerator<string> {
  if (!text) return;

  const regex = /\{\{([^}]+)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      yield text.substring(lastIndex, match.index);
    }

    const reference = match[1].trim();
    if (reference.includes('.')) {
      const parts = reference.split('.', 2);
      const nodeId = parts[0].trim();
      const nodeResult = await runtime.getNodeExecuteResult(context, nodeId);
      if (nodeResult?.streamingExecutor) {
        yield* nodeResult.streamingExecutor();
      } else if (nodeResult?.result) {
        const value = extractByJsonPath(nodeResult.result, parts[1].trim());
        if (value) yield String(value);
      }
    } else {
      const variable = context.flowConfigInfoForRun?.variables?.find((v) => v.name === reference);
      const val = variable?.hasValue ? variable.value : variable?.defaultValue;
      if (val !== undefined && val !== null) yield String(val);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    yield text.substring(lastIndex);
  }
}

function extractByJsonPath(source: any, path: string): any {
  if (!source) return null;
  const parts = path.split('.');
  let current = source;
  for (const part of parts) {
    if (current == null) return null;
    if (typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return null;
    }
  }
  return current;
}
