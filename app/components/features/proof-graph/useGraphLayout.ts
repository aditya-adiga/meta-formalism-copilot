import { useRef, useMemo, useCallback } from "react";
import dagre from "dagre";
import type { Node, Edge } from "reactflow";
import type { PropositionNode, GraphLayout } from "@/app/lib/types/decomposition";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;

/**
 * Convert PropositionNode[] into ReactFlow nodes + edges using incremental Dagre layout.
 *
 * Nodes with persisted or previously-computed positions keep them. Only new nodes
 * (no known position) trigger a Dagre run, which positions them relative to the
 * full graph structure. This supports drag-to-reposition: dragged nodes stay put,
 * and newly extracted nodes slot in via Dagre.
 *
 * The positions ref is read during render (inside useMemo) intentionally — it acts
 * as an accumulator that persists across streaming updates without triggering extra
 * renders. Same pattern as useCausalGraphLayout.
 */
export function useGraphLayout(
  propositions: PropositionNode[],
  initialPositions?: GraphLayout["positions"],
) {
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const initializedRef = useRef(false);

  /* eslint-disable react-hooks/refs */

  // Seed persisted positions on first call. Read during render intentionally —
  // same accumulator pattern as useCausalGraphLayout and the useMemo below.
  if (initialPositions && !initializedRef.current) {
    for (const [id, pos] of Object.entries(initialPositions)) {
      positionsRef.current.set(id, pos);
    }
    initializedRef.current = true;
  }

  const layout = useMemo(() => {
    if (propositions.length === 0) {
      positionsRef.current = new Map();
      initializedRef.current = false;
      return { nodes: [], edges: [] };
    }

    const knownPositions = positionsRef.current;

    // Find nodes that don't have a position yet
    const newNodeIds = propositions
      .filter((p) => !knownPositions.has(p.id))
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

      // Only assign positions for NEW nodes
      for (const id of newNodeIds) {
        const pos = g.node(id);
        knownPositions.set(id, {
          x: (pos?.x ?? 0) - NODE_WIDTH / 2,
          y: (pos?.y ?? 0) - NODE_HEIGHT / 2,
        });
      }
    }

    // Prune positions for nodes that no longer exist
    const propIds = new Set(propositions.map((p) => p.id));
    for (const id of knownPositions.keys()) {
      if (!propIds.has(id)) {
        knownPositions.delete(id);
      }
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
      const pos = knownPositions.get(prop.id) ?? { x: 0, y: 0 };
      return {
        id: prop.id,
        type: "proofNode",
        position: pos,
        data: prop,
      };
    });

    return { nodes, edges };
  }, [propositions]);
  /* eslint-enable react-hooks/refs */

  /** Call when a node is dragged to update the positions cache. */
  const updateNodePosition = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      positionsRef.current.set(nodeId, position);
    },
    [],
  );

  /** Export current positions as a plain object for persistence. */
  const getPositions = useCallback((): GraphLayout["positions"] => {
    const result: GraphLayout["positions"] = {};
    for (const [id, pos] of positionsRef.current) {
      result[id] = pos;
    }
    return result;
  }, []);

  return { ...layout, updateNodePosition, getPositions };
}
