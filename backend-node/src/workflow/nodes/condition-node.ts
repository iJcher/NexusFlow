import { NodeConfig, FlowRuntimeContext, NodeLine, NodeExecuteResult } from '../types';
import { createSuccessResult, FlowRuntime } from './node-base';
import { computeExpression } from '../expression/expression-helper';

export function executeConditionNode(node: NodeConfig): NodeExecuteResult {
  return createSuccessResult(node.id, 'condition node execute success');
}

export async function getConditionExecuteLine(
  node: NodeConfig,
  context: FlowRuntimeContext,
  runtime: FlowRuntime,
): Promise<NodeLine | null> {
  const conditions = node.conditions || [];
  for (const condition of conditions) {
    if (!condition.expressionUnit) throw new Error(`Condition rule expression is null`);
    if (!condition.lineId) throw new Error(`Condition rule line id is null`);

    const result = await computeExpression(condition.expressionUnit, context, runtime);
    const isMet = Boolean(result);
    if (isMet) {
      const line = context.flowConfigInfoForRun.lines.find((l) => l.id === condition.lineId);
      if (!line) throw new Error(`Condition line ${condition.lineId} not found`);
      return line;
    }
  }

  const elseRule = node.elseRule;
  if (elseRule?.lineId) {
    const line = context.flowConfigInfoForRun.lines.find((l) => l.id === elseRule.lineId);
    if (!line) throw new Error(`Else line ${elseRule.lineId} not found`);
    return line;
  }

  throw new Error(`Condition node ${node.displayName}: no available path`);
}
