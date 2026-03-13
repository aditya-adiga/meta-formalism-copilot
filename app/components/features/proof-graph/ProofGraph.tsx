"use client";

import { useCallback, useMemo } from "react";
import ReactFlow, { Background, Controls, type NodeMouseHandler } from "reactflow";
import "reactflow/dist/style.css";
import type { PropositionNode } from "@/app/lib/types/decomposition";
import ProofGraphNode from "@/app/components/features/proof-graph/ProofGraphNode";
import { useGraphLayout } from "@/app/components/features/proof-graph/useGraphLayout";

const nodeTypes = { proofNode: ProofGraphNode };

type ProofGraphProps = {
  propositions: PropositionNode[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  sourceColorMap: Record<string, string>;
};

export default function ProofGraph({ propositions, selectedNodeId, onSelectNode, sourceColorMap }: ProofGraphProps) {
  const { nodes, edges } = useGraphLayout(propositions);

  // Inject sourceColor into each node's data
  const coloredNodes = useMemo(() => {
    return nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        sourceColor: sourceColorMap[n.data.sourceId] ?? undefined,
      },
    }));
  }, [nodes, sourceColorMap]);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      onSelectNode(node.id);
    },
    [onSelectNode],
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={coloredNodes.map((n) => ({
          ...n,
          selected: n.id === selectedNodeId,
        }))}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={2}
      >
        <Background color="#DDD9D5" gap={20} />
        <Controls
          showInteractive={false}
          className="!bg-white !border-[#DDD9D5] !shadow-sm"
        />
      </ReactFlow>
    </div>
  );
}
