"use client";

import { useState } from "react";
import type { PropositionNode, NodeGroup, NodeVerificationStatus } from "@/app/lib/types/decomposition";

type GroupDetailPanelProps = {
  /** Resolved nodes in the current selection */
  selectedNodes: PropositionNode[];
  /** The active saved group (null if unsaved selection) */
  activeGroup: NodeGroup | null;
  onSaveGroup: (name: string) => void;
  onUpdateGroup: (updates: { name?: string; nodeIds?: string[] }) => void;
  onDeleteGroup: () => void;
  onFormalizeGroup: () => void;
  loading: boolean;
  onGroupContextChange: (text: string) => void;
  groupContext: string;
};

const STATUS_LABELS: Record<NodeVerificationStatus, { text: string; color: string }> = {
  unverified: { text: "Unverified", color: "var(--status-unverified)" },
  "in-progress": { text: "In Progress", color: "var(--status-in-progress)" },
  verified: { text: "Verified", color: "var(--status-verified)" },
  failed: { text: "Failed", color: "var(--status-failed)" },
};

export default function GroupDetailPanel({
  selectedNodes,
  activeGroup,
  onSaveGroup,
  onUpdateGroup,
  onDeleteGroup,
  onFormalizeGroup,
  loading,
  onGroupContextChange,
  groupContext,
}: GroupDetailPanelProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(activeGroup?.name ?? "");
  const [newGroupName, setNewGroupName] = useState("");

  const isSaved = activeGroup !== null;
  const groupName = activeGroup?.name ?? "Unsaved Group";

  const handleStartEdit = () => {
    setNameValue(activeGroup?.name ?? "");
    setEditingName(true);
  };

  const handleFinishEdit = () => {
    setEditingName(false);
    if (nameValue.trim() && nameValue !== activeGroup?.name) {
      onUpdateGroup({ name: nameValue.trim() });
    }
  };

  const handleSave = () => {
    const name = newGroupName.trim() || `Group (${selectedNodes.length} nodes)`;
    onSaveGroup(name);
    setNewGroupName("");
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-3">
        <div className="flex items-center gap-2">
          {editingName ? (
            <input
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={handleFinishEdit}
              onKeyDown={(e) => { if (e.key === "Enter") handleFinishEdit(); }}
              autoFocus
              className="rounded border border-[#DDD9D5] bg-white px-2 py-0.5 text-sm font-semibold text-[var(--ink-black)] focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          ) : (
            <h2
              className={`text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)] ${isSaved ? "cursor-pointer hover:text-indigo-600" : ""}`}
              onClick={isSaved ? handleStartEdit : undefined}
              title={isSaved ? "Click to rename" : undefined}
            >
              {groupName}
            </h2>
          )}
          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-indigo-700">
            {selectedNodes.length} node{selectedNodes.length !== 1 ? "s" : ""}
          </span>
        </div>
        {isSaved && (
          <button
            onClick={onDeleteGroup}
            className="text-[10px] font-medium text-red-500 hover:text-red-700"
          >
            Delete Group
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {/* Node list */}
        <div className="flex flex-col gap-3 p-6 pb-2">
          {selectedNodes.map((node) => {
            const status = STATUS_LABELS[node.verificationStatus];
            return (
              <div key={node.id} className="rounded-md border border-[#DDD9D5] bg-white p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-[var(--ink-black)]">{node.label}</span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white"
                    style={{ backgroundColor: status.color }}
                  >
                    {status.text}
                  </span>
                  <span className="rounded bg-[#F5F1ED] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#6B6560] border border-[#DDD9D5]">
                    {node.kind}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-[var(--ink-black)]">
                  {node.statement}
                </p>
                {node.proofText && (
                  <p className="mt-1 text-xs text-[#6B6560] leading-relaxed">
                    {node.proofText}
                  </p>
                )}
              </div>
            );
          })}

          {/* Group-level artifacts (if saved group has them) */}
          {activeGroup?.semiformalProof && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6B6560]">
                Group Semiformal Proof
              </h3>
              <pre className="rounded-md border border-[#DDD9D5] bg-white px-4 py-3 text-sm leading-relaxed text-[var(--ink-black)] whitespace-pre-wrap">
                {activeGroup.semiformalProof}
              </pre>
            </section>
          )}

          {activeGroup?.leanCode && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6B6560]">
                Group Lean4 Code
              </h3>
              <pre className="rounded-md border border-[#DDD9D5] bg-white px-4 py-3 font-mono text-sm leading-relaxed text-[var(--ink-black)] whitespace-pre-wrap">
                {activeGroup.leanCode}
              </pre>
            </section>
          )}

          {activeGroup?.verificationErrors && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-800">
                Verification Errors
              </h3>
              <pre className="rounded-md border border-red-300 bg-red-50 px-4 py-3 font-mono text-xs leading-relaxed text-red-700 whitespace-pre-wrap">
                {activeGroup.verificationErrors}
              </pre>
            </section>
          )}

          <div className="border-t border-[#DDD9D5]" />

          {/* Group context */}
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6B6560]">
              Group Context
            </h3>
            <textarea
              value={groupContext}
              onChange={(e) => onGroupContextChange(e.target.value)}
              placeholder="Optional context for group formalization..."
              rows={3}
              className="w-full rounded-md border border-[#DDD9D5] bg-white px-4 py-2 text-sm text-[var(--ink-black)] placeholder:text-[#9A9590] focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none"
            />
          </section>
        </div>

        {/* Action buttons */}
        <div className="shrink-0 border-t border-[#DDD9D5] px-4 py-3 flex flex-col gap-2">
          {!isSaved && (
            <div className="flex gap-2">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name..."
                className="flex-1 rounded-full border border-[#DDD9D5] bg-white px-4 py-2 text-sm text-[var(--ink-black)] placeholder:text-[#9A9590] focus:outline-none focus:ring-1 focus:ring-indigo-400"
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              />
              <button
                type="button"
                onClick={handleSave}
                className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-md hover:shadow-lg"
              >
                Save Group
              </button>
            </div>
          )}
          {isSaved && selectedNodes.length !== activeGroup.nodeIds.length && (
            <button
              type="button"
              onClick={() => onUpdateGroup({ nodeIds: selectedNodes.map((n) => n.id) })}
              className="w-full rounded-full border border-indigo-300 bg-indigo-50 px-6 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
            >
              Update Selection ({selectedNodes.length} nodes)
            </button>
          )}
          <button
            type="button"
            onClick={onFormalizeGroup}
            disabled={loading || selectedNodes.length === 0}
            className="w-full rounded-full bg-[var(--ink-black)] px-6 py-2.5 text-sm font-medium text-white shadow-md transition-shadow duration-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--ink-black)] focus:ring-offset-2 focus:ring-offset-[var(--ivory-cream)] disabled:opacity-50"
          >
            {loading ? "Formalizing..." : "Formalize as Group"}
          </button>
        </div>
      </div>
    </div>
  );
}
