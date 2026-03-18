import { NodeConfig, NodeLine, NodeExecuteResult, FlowRuntimeContext } from '../types';

export interface IFlowNode {
  execute(context: FlowRuntimeContext, runtime: FlowRuntime): Promise<NodeExecuteResult>;
  getExecuteLine(context: FlowRuntimeContext, runtime: FlowRuntime): Promise<NodeLine | null>;
  callbackAfterExecute(context: FlowRuntimeContext, runtime: FlowRuntime): Promise<void>;
}

export interface FlowRuntime {
  currentNode: NodeConfig | null;
  getNodeExecuteResult(context: FlowRuntimeContext, nodeId: string): Promise<NodeExecuteResult | null>;
}

export function createSuccessResult(nodeId: string, result?: any, streamingExecutor?: () => AsyncGenerator<string>): NodeExecuteResult {
  return { nodeId, isSuccess: true, result, errorMsg: '', errorCode: 0, streamingExecutor };
}

export function createErrorResult(nodeId: string, errorMsg: string, errorCode = 61002): NodeExecuteResult {
  return { nodeId, isSuccess: false, errorMsg, errorCode };
}

export function getDefaultExecuteLine(nodeId: string, context: FlowRuntimeContext): NodeLine | null {
  return context.flowConfigInfoForRun.lines.find((l) => l.fromNodeId === nodeId) || null;
}
