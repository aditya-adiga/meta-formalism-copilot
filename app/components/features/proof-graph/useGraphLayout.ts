import { useState, useCallback, useEffect } from "react";
import { applyNodeChanges, type Node, type Edge, type NodeChange } from "reactflow";
import dagre from "dagre";
import type { PropositionNode, GraphLayout } from "@/app/lib/types/decomposition";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;

/** Pure function: compute ReactFlow nodes + edges, mutating positionMap in place. */
function buildLayout(
  propositions: PropositionNode[],
  positionMap: Map<string, { x: number; y: number }>,
): { nodes: Node[]; edges: Edge[] } {
  if (propositions.length === 0) {
    positionMap.clear();
    return { nodes: [], edges: [] };
  }

  // Find nodes that don't have a position yet
  const newNodeIds = propositions
    .filter((p) => !positionMap.has(p.id))
    .map((p) => p.id);

  // Only run Dagre if there are new nodes to position
  if (newNodeIds.length > 0) {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 60 });

    for (const prop of propositions) {
      g.setNode(prop.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }
    for (const prop of propositions) {
      for (const depId of prop.dependsOn) {
        g.setEdge(depId, prop.id);
      }
    }

    dagre.layout(g);

    for (const id of newNodeIds) {
      const pos = g.node(id);
      positionMap.set(id, {
        x: (pos?.x ?? 0) - NODE_WIDTH / 2,
        y: (pos?.y ?? 0) - NODE_HEIGHT / 2,
      });
    }
  }

  // Prune positions for nodes that no longer exist
  const propIds = new Set(propositions.map((p) => p.id));
  for (const id of positionMap.keys()) {
    if (!propIds.has(id)) positionMap.delete(id);
  }

  // During streaming, partial-JSON may produce truncated dependency IDs
  // that reference non-existent nodes. Filter those out.
  const edges: Edge[] = [];
  for (const prop of propositions) {
    for (const depId of prop.dependsOn) {
      if (propIds.has(depId)) {
        edges.push({
          id: `${depId}->${prop.id}`,
          source: depId,
          target: prop.id,
          style: { stroke: "#9A9590", strokeWidth: 1.5 },
        });
      }
    }
  }

  const nodes: Node[] = propositions.map((prop) => {
    const pos = positionMap.get(prop.id) ?? { x: 0, y: 0 };
    return {
      id: prop.id,
      type: "proofNode",
      position: pos,
      data: prop,
    };
  });

  return { nodes, edges };
}

/**
 * Convert PropositionNode[] into ReactFlow nodes + edges using incremental Dagre layout.
 *
 * Nodes with persisted or previously-computed positions keep them. Only new nodes
 * trigger a Dagre run. Nodes are kept in React state so ReactFlow drag changes
 * (via onNodesChange / applyNodeChanges) are reflected in real-time.
 */
export function useGraphLayout(
  propositions: PropositionNode[],
  initialPositions?: GraphLayout["positions"],
) {
  // Position cache is a module-level Map captured in a closure by the state
  // initializer and callbacks. It never needs to be read during render — only
  // inside effects, callbacks, and the one-time useState initializer.
  const [positionMap] = useState(() => {
    const map = new Map<string, { x: number; y: number }>();
    if (initialPositions) {
      for (const [id, pos] of Object.entries(initialPositions)) {
        map.set(id, pos);
      }
    }
    return map;
  });

  const [layout, setLayout] = useState(() => buildLayout(propositions, positionMap));

  // Recompute when propositions change (new extraction, node added/removed, etc.)
  useEffect(() => {
    setLayout(buildLayout(propositions, positionMap));
  }, [propositions, positionMap]);

  /**
   * Apply ReactFlow node changes (drag, select, etc.) in real-time.
   * This is what makes nodes visually follow the cursor during drag.
   */
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setLayout((prev) => ({
        ...prev,
        nodes: applyNodeChanges(changes, prev.nodes),
      }));
    },
    [],
  );

  const { nodes, edges } = layout;

  /** Persist a node's final drag position to the cache. */
  const updateNodePosition = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      positionMap.set(nodeId, position);
    },
    [positionMap],
  );

  /** Export current positions as a plain object for persistence. */
  const getPositions = useCallback((): GraphLayout["positions"] => {
    const result: GraphLayout["positions"] = {};
    for (const [id, pos] of positionMap) {
      result[id] = pos;
    }
    return result;
  }, [positionMap]);

  return { nodes, edges, onNodesChange, updateNodePosition, getPositions };
}
