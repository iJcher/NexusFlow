import { NodeConfig, NodeExecuteResult } from '../types';
import { createErrorResult } from './node-base';

export function executeEndNode(node: NodeConfig): NodeExecuteResult {
  return createErrorResult(node.id, 'End node reached');
}
