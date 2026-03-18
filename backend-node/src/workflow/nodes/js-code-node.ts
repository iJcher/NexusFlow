import { NodeConfig, FlowRuntimeContext, NodeExecuteResult } from '../types';
import { createSuccessResult, createErrorResult, FlowRuntime } from './node-base';
import { computeExpression } from '../expression/expression-helper';

export async function executeJSCodeNode(
  node: NodeConfig,
  context: FlowRuntimeContext,
  runtime: FlowRuntime,
): Promise<NodeExecuteResult> {
  try {
    const codeUnit = node.codeUnit;
    if (!codeUnit) return createErrorResult(node.id, 'No code unit provided');

    const executeResult = await computeExpression(codeUnit, context, runtime);
    const resultObj: Record<string, any> = {};
    const outputs = node.outputs || [];

    if (executeResult && typeof executeResult === 'object') {
      for (const output of outputs) {
        resultObj[output.name] = (executeResult as any)[output.name] ?? null;
      }
    }

    return createSuccessResult(node.id, resultObj);
  } catch (e: any) {
    return createErrorResult(node.id, `js code node failed: ${e.message}`);
  }
}
