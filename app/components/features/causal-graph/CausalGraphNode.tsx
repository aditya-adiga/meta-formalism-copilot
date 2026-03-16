import { memo } from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";

export type CausalNodeData = {
  id: string;
  label: string;
  description: string;
  isConfounder: boolean;
};

function CausalGraphNode({ data }: NodeProps<CausalNodeData>) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg border bg-white px-3 py-2 shadow-sm transition-shadow hover:shadow-md"
      style={{
        borderColor: data.isConfounder ? "#D97706" : "#9A9590",
        borderWidth: 2,
        minWidth: 160,
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-[#9A9590]" />

      {data.isConfounder && (
        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white bg-amber-600">
          confounder
        </span>
      )}

      <span className="mt-1 text-center text-xs font-semibold text-[var(--ink-black)]">
        {data.label}
      </span>

      <span className="mt-0.5 text-center text-[9px] text-[#6B6560] line-clamp-2">
        {data.description}
      </span>

      <Handle type="source" position={Position.Bottom} className="!bg-[#9A9590]" />
    </div>
  );
}

export default memo(CausalGraphNode);
