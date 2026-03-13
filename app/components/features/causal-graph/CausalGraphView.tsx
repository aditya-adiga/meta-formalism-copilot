"use client";

import { useCallback, useState } from "react";
import ReactFlow, { Background, Controls, type NodeMouseHandler } from "reactflow";
import "reactflow/dist/style.css";
import type { CausalGraphResponse } from "@/app/lib/types/artifacts";
import CausalGraphNode from "./CausalGraphNode";
import { useCausalGraphLayout } from "./useCausalGraphLayout";

const nodeTypes = { causalNode: CausalGraphNode };

type CausalGraphViewProps = {
  causalGraph: CausalGraphResponse["causalGraph"];
  onSelectVariable?: (id: string) => void;
};

export default function CausalGraphView({ causalGraph, onSelectVariable }: CausalGraphViewProps) {
  const { nodes, edges } = useCausalGraphLayout(causalGraph);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      setSelectedId(node.id);
      onSelectVariable?.(node.id);
    },
    [onSelectVariable],
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes.map((n) => ({
          ...n,
          selected: n.id === selectedId,
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
