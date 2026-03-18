import { NodeConfig, NodeExecuteResult } from '../types';
import { createSuccessResult } from './node-base';

export function executeStartNode(node: NodeConfig): NodeExecuteResult {
  return createSuccessResult(node.id);
}
