import { NodeConfig, FlowRuntimeContext, NodeExecuteResult } from '../types';
import { createSuccessResult, FlowRuntime } from './node-base';
import { computeExpression } from '../expression/expression-helper';

export async function executeAssignVariableNode(
  node: NodeConfig,
  context: FlowRuntimeContext,
  runtime: FlowRuntime,
): Promise<NodeExecuteResult> {
  const assignments = node.assignments || [];
  for (const assignment of assignments) {
    const result = await computeExpression(assignment.expressionUnit, context, runtime);
    const variable = context.flowConfigInfoForRun.variables.find((v) => v.name === assignment.targetVariableName);
    if (!variable) throw new Error(`Variable ${assignment.targetVariableName} not found`);
    variable.value = result;
    variable.hasValue = true;
  }
  return createSuccessResult(node.id, 'assign variable success');
}
