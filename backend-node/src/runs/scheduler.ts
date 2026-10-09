import { Json, WorkflowGraph, isObject } from './contracts';

export interface DagPlan {
  ready: string[];
  skipped: string[];
  edges: { id: string; status: 'active' | 'inactive' }[];
}
export function planDag(
  graph: WorkflowGraph,
  nodeStates: Record<string, { status: string; output?: Json }>,
  edgeStates: Record<string, 'unresolved' | 'active' | 'inactive'>,
): DagPlan {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const statuses = Object.fromEntries(
    Object.entries(nodeStates).map(([id, value]) => [id, value.status]),
  );
  const resolved = { ...edgeStates };
  const result: DagPlan = { ready: [], skipped: [], edges: [] };
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of graph.edges) {
      if ((resolved[edge.id] ?? 'unresolved') !== 'unresolved') continue;
      const status = statuses[edge.from];
      const source = nodes.get(edge.from)!;
      let decision: 'active' | 'inactive' | undefined;
      if (status === 'succeeded') {
        const output = nodeStates[edge.from]?.output;
        decision =
          source.kind !== 'condition' ||
          (isObject(output) && output.matched === edge.branch)
            ? 'active'
            : 'inactive';
      } else if (status === 'failed' && source.onError === 'continue')
        decision = 'active';
      else if (['failed', 'skipped', 'cancelled'].includes(status))
        decision = 'inactive';
      if (decision) {
        resolved[edge.id] = decision;
        result.edges.push({ id: edge.id, status: decision });
        changed = true;
      }
    }
    for (const node of graph.nodes) {
      if ((statuses[node.id] ?? 'pending') !== 'pending') continue;
      const incoming = graph.edges.filter((edge) => edge.to === node.id);
      if (
        incoming.some(
          (edge) => (resolved[edge.id] ?? 'unresolved') === 'unresolved',
        )
      )
        continue;
      if (
        incoming.length === 0 ||
        incoming.some((edge) => resolved[edge.id] === 'active')
      ) {
        statuses[node.id] = 'ready';
        result.ready.push(node.id);
      } else {
        statuses[node.id] = 'skipped';
        result.skipped.push(node.id);
      }
      changed = true;
    }
  }
  return result;
}
