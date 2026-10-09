import type {
  NodeConfig,
  FlowRuntimeContext,
  NodeExecuteResult,
} from '../types';
import type { FlowRuntime } from './node-base';
import { createErrorResult } from './node-base';
export function executeJSCodeNode(
  node: NodeConfig,
  _context: FlowRuntimeContext,
  _runtime: FlowRuntime,
): Promise<NodeExecuteResult> {
  void _context;
  void _runtime;
  return Promise.resolve(
    createErrorResult(
      node.id,
      'JS execution disabled: secure isolated runner unavailable',
      61003,
    ),
  );
}
