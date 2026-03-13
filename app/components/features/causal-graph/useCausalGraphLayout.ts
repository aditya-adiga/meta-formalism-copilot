import { useMemo } from "react";
import dagre from "dagre";
import type { Node, Edge } from "reactflow";
import type { CausalGraphResponse } from "@/app/lib/types/artifacts";
import type { CausalNodeData } from "./CausalGraphNode";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 70;

/**
 * Convert CausalGraphResponse data into ReactFlow nodes + edges using Dagre layout.
 * Variables become nodes; causal edges become directed edges with weight-based styling.
 * Confounders are marked on matching variable nodes.
 */
export function useCausalGraphLayout(
  causalGraph: CausalGraphResponse["causalGraph"] | null,
) {
  return useMemo(() => {
    if (!causalGraph || causalGraph.variables.length === 0)
      return { nodes: [], edges: [] };

    const confounderIds = new Set(causalGraph.confounders.map((c) => c.id));

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 70 });

    for (const v of causalGraph.variables) {
      g.setNode(v.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }

    const edges: Edge[] = [];
    for (const e of causalGraph.edges) {
      const edgeId = `${e.from}->${e.to}`;
      g.setEdge(e.from, e.to);

      // Color by weight direction, thickness by magnitude
      const abs = Math.abs(e.weight);
      const strokeColor = e.weight >= 0 ? "#059669" : "#DC2626";
      const strokeWidth = abs > 0.7 ? 3 : abs > 0.3 ? 2 : 1;

      edges.push({
        id: edgeId,
        source: e.from,
        target: e.to,
        style: { stroke: strokeColor, strokeWidth },
        label: e.weight.toFixed(2),
        labelStyle: { fontSize: 10, fill: strokeColor },
        animated: abs > 0.7,
      });
    }

    dagre.layout(g);

    const nodes: Node<CausalNodeData>[] = causalGraph.variables.map((v) => {
      const pos = g.node(v.id);
      return {
        id: v.id,
        type: "causalNode",
        position: {
          x: (pos?.x ?? 0) - NODE_WIDTH / 2,
          y: (pos?.y ?? 0) - NODE_HEIGHT / 2,
        },
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
}
