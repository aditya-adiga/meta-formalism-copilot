import type { PropositionNode } from "@/app/lib/types/decomposition";

/**
 * Returns node IDs in topological order (dependencies before dependents).
 * Handles disconnected components and gracefully skips cycle participants.
 */
export function topologicalSort(nodes: PropositionNode[]): string[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const order: string[] = [];

  function visit(id: string, path: Set<string>) {
    if (visited.has(id)) return;
    if (path.has(id)) return; // cycle — skip
    path.add(id);

    const node = nodeMap.get(id);
    if (!node) return;

    for (const depId of node.dependsOn) {
      visit(depId, path);
    }

    path.delete(id);
    visited.add(id);
    order.push(id);
  }

  // Visit every node so disconnected components are included
  for (const node of nodes) {
    visit(node.id, new Set<string>());
  }

  return order;
}
