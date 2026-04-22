import { useMemo } from "react";
import dagre from "dagre";
import type { Node, Edge } from "reactflow";
import type { PropositionNode } from "@/app/lib/types/decomposition";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;

/**
 * Convert PropositionNode[] into ReactFlow nodes + edges using Dagre layout.
 * Top-to-bottom direction so dependencies flow downward.
 */
export function useGraphLayout(propositions: PropositionNode[]) {
  return useMemo(() => {
    if (propositions.length === 0) return { nodes: [], edges: [] };

    // Single Set for edge validation — during streaming, partial-JSON may
    // produce truncated dependency IDs that reference non-existent nodes.
    const nodeIds = new Set(propositions.map((p) => p.id));

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 60 });

    for (const prop of propositions) {
      g.setNode(prop.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }

    const edges: Edge[] = [];
    for (const prop of propositions) {
      for (const depId of prop.dependsOn) {
        if (nodeIds.has(depId)) {
          const edgeId = `${depId}->${prop.id}`;
          g.setEdge(depId, prop.id);
          edges.push({
            id: edgeId,
            source: depId,
            target: prop.id,
            style: { stroke: "#9A9590", strokeWidth: 1.5 },
          });
        }
      }
    }

    dagre.layout(g);

    const nodes: Node[] = propositions.map((prop) => {
      const pos = g.node(prop.id);
      return {
        id: prop.id,
        type: "proofNode",
        position: {
          x: (pos?.x ?? 0) - NODE_WIDTH / 2,
          y: (pos?.y ?? 0) - NODE_HEIGHT / 2,
        },
        data: prop,
      };
    });

    return { nodes, edges };
  }, [propositions]);
}
