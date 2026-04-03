/**
 * Pure graph operations for decomposition editing.
 *
 * Each function takes an immutable PropositionNode[] and returns a new array.
 * Inspired by the service-layer pattern in conversation_trees — all mutation
 * logic is co-located and independently testable, not scattered across hooks.
 */

import type { PropositionNode, NodeKind } from "@/app/lib/types/decomposition";

// ---------------------------------------------------------------------------
// Cycle detection
// ---------------------------------------------------------------------------

/**
 * Returns true if adding an edge from `fromId` to `toId` would create a cycle
 * in the dependency graph. Uses DFS from `fromId` following dependsOn chains
 * to check if `fromId` can already reach `toId` — if so, adding
 * "toId dependsOn fromId" would close a cycle.
 */
export function wouldCreateCycle(
  nodes: PropositionNode[],
  fromId: string,
  toId: string,
): boolean {
  if (fromId === toId) return true;

  // We're adding: toId dependsOn fromId (edge points from dependency to dependent).
  // A cycle exists if fromId is already reachable from toId via dependsOn.
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();

  function canReach(current: string, target: string): boolean {
    if (current === target) return true;
    if (visited.has(current)) return false;
    visited.add(current);

    const node = nodeMap.get(current);
    if (!node) return false;

    for (const depId of node.dependsOn) {
      if (canReach(depId, target)) return true;
    }
    return false;
  }

  return canReach(fromId, toId);
}

// ---------------------------------------------------------------------------
// Node operations
// ---------------------------------------------------------------------------

export type NewNodeInput = {
  label: string;
  kind?: NodeKind;
  statement?: string;
  sourceId?: string;
  sourceLabel?: string;
};

/** Add a new node to the graph. Returns [updatedNodes, newNodeId]. */
export function addNode(
  nodes: PropositionNode[],
  input: NewNodeInput,
): [PropositionNode[], string] {
  const id = crypto.randomUUID();
  const newNode: PropositionNode = {
    id,
    label: input.label,
    kind: input.kind ?? "claim",
    statement: input.statement ?? "",
    proofText: "",
    dependsOn: [],
    sourceId: input.sourceId ?? "",
    sourceLabel: input.sourceLabel ?? "",
    semiformalProof: "",
    leanCode: "",
    verificationStatus: "unverified",
    verificationErrors: "",
    context: "",
    selectedArtifactTypes: [],
    artifacts: [],
  };
  return [[...nodes, newNode], id];
}

/** Remove a node and all edges referencing it (both dependsOn and as a dependency). */
export function removeNode(
  nodes: PropositionNode[],
  nodeId: string,
): PropositionNode[] {
  return nodes
    .filter((n) => n.id !== nodeId)
    .map((n) =>
      n.dependsOn.includes(nodeId)
        ? { ...n, dependsOn: n.dependsOn.filter((d) => d !== nodeId) }
        : n,
    );
}

/** Rename a node's label. */
export function renameNode(
  nodes: PropositionNode[],
  nodeId: string,
  label: string,
): PropositionNode[] {
  return nodes.map((n) => (n.id === nodeId ? { ...n, label } : n));
}

/** Update a node's statement text. */
export function updateNodeStatement(
  nodes: PropositionNode[],
  nodeId: string,
  statement: string,
): PropositionNode[] {
  return nodes.map((n) => (n.id === nodeId ? { ...n, statement } : n));
}

// ---------------------------------------------------------------------------
// Edge operations
// ---------------------------------------------------------------------------

/**
 * Add a dependency edge: `toId` depends on `fromId`.
 * Returns null if either node doesn't exist, the edge already exists,
 * or the edge would create a cycle.
 */
export function addEdge(
  nodes: PropositionNode[],
  fromId: string,
  toId: string,
): PropositionNode[] | null {
  // Validate both nodes exist
  const toNode = nodes.find((n) => n.id === toId);
  const fromExists = nodes.some((n) => n.id === fromId);
  if (!toNode || !fromExists) return null;

  // Already exists
  if (toNode.dependsOn.includes(fromId)) return null;

  // Cycle check
  if (wouldCreateCycle(nodes, fromId, toId)) return null;

  return nodes.map((n) =>
    n.id === toId ? { ...n, dependsOn: [...n.dependsOn, fromId] } : n,
  );
}

/** Remove a dependency edge: `toId` no longer depends on `fromId`. */
export function removeEdge(
  nodes: PropositionNode[],
  fromId: string,
  toId: string,
): PropositionNode[] {
  return nodes.map((n) =>
    n.id === toId
      ? { ...n, dependsOn: n.dependsOn.filter((d) => d !== fromId) }
      : n,
  );
}
