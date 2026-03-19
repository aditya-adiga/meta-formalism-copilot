import { useRef, useMemo } from "react";
import dagre from "dagre";
import type { Node, Edge } from "reactflow";
import type { CausalGraphResponse } from "@/app/lib/types/artifacts";
import type { CausalNodeData } from "./CausalGraphNode";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 70;

/**
 * Convert CausalGraphResponse data into ReactFlow nodes + edges using incremental Dagre layout.
 *
 * New nodes are positioned via Dagre relative to the existing graph. Existing nodes
 * preserve their positions so that streaming updates and future user interactions
 * (drag, delete) don't cause full re-layout.
 *
 * The positions ref is read during render (inside useMemo) intentionally — it acts as
 * an accumulator that must persist across streaming updates without triggering extra renders.
 * This is a standard pattern for derived-state-with-cache that React's lint rules are
 * overly strict about. See https://react.dev/reference/react/useRef#caveats
 */
export function useCausalGraphLayout(
  causalGraph: CausalGraphResponse["causalGraph"] | null,
) {
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  /* eslint-disable react-hooks/refs */
  return useMemo(() => {
    if (!causalGraph) return { nodes: [], edges: [] };

    const variables = causalGraph.variables ?? [];
    const graphEdges = causalGraph.edges ?? [];
    const confounders = causalGraph.confounders ?? [];

    if (variables.length === 0) return { nodes: [], edges: [] };

    const confounderIds = new Set(confounders.map((c) => c.id));
    const knownPositions = positionsRef.current;

    // Find which nodes are new (no position yet)
    const newNodeIds = variables.filter((v) => !knownPositions.has(v.id)).map((v) => v.id);

    // Only run Dagre if there are new nodes to position
    if (newNodeIds.length > 0) {
      const g = new dagre.graphlib.Graph();
      g.setDefaultEdgeLabel(() => ({}));
      g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 70 });

      for (const v of variables) {
        g.setNode(v.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
      }
      for (const e of graphEdges) {
        g.setEdge(e.from, e.to);
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

    // Build ReactFlow edges with weight-based styling
    const edges: Edge[] = graphEdges.map((e) => {
      const edgeId = `${e.from}->${e.to}`;
      const abs = Math.abs(e.weight);
      const strokeColor = e.weight >= 0 ? "#059669" : "#DC2626";
      const strokeWidth = abs > 0.7 ? 3 : abs > 0.3 ? 2 : 1;

      return {
        id: edgeId,
        source: e.from,
        target: e.to,
        style: { stroke: strokeColor, strokeWidth },
        label: e.weight.toFixed(2),
        labelStyle: { fontSize: 10, fill: strokeColor },
        animated: abs > 0.7,
      };
    });

    // Build ReactFlow nodes from known positions
    const nodes: Node<CausalNodeData>[] = variables.map((v) => {
      const pos = knownPositions.get(v.id) ?? { x: 0, y: 0 };
      return {
        id: v.id,
        type: "causalNode",
        position: pos,
        data: {
          id: v.id,
          label: v.label,
          description: v.description,
          isConfounder: confounderIds.has(v.id),
        },
      };
    });

    return { nodes, edges };
  }, [causalGraph]);
  /* eslint-enable react-hooks/refs */
}
