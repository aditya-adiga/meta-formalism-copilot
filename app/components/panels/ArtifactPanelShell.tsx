"use client";

import type { ReactNode } from "react";
import WholeTextEditBar from "@/app/components/features/output-editing/ai-bars/WholeTextEditBar";
import type { WaitTimeEstimate } from "@/app/hooks/useWaitTimeEstimate";

/** Shared editing props for whole-document AI rewrites (shell-level). */
export type ArtifactEditingProps = {
  /** Called with instruction for whole-document AI rewrites */
  onAiEdit?: (instruction: string) => void;
  /** Whether a whole-document AI edit is currently in flight */
  editing?: boolean;
  /** Wait time estimate for the in-flight edit */
  editWaitEstimate?: WaitTimeEstimate | null;
};

type ArtifactPanelShellProps = {
  title: string;
  loading?: boolean;
  hasData: boolean;
  emptyMessage: string;
  loadingMessage: string;
  children: ReactNode;
} & ArtifactEditingProps;

/**
 * Shared shell for artifact panels (causal graph, statistical model, etc.).
 * Handles the outer container, header bar, empty state, loading state,
 * and — when onAiEdit is provided — a WholeTextEditBar for full-document AI rewrites.
 * Section-level editing is handled by EditableSection within each panel's children.
 */
export default function ArtifactPanelShell({
  title,
  loading,
  hasData,
  emptyMessage,
  loadingMessage,
  children,
  onAiEdit,
  editing,
  editWaitEstimate,
}: ArtifactPanelShellProps) {
  const header = (
    <div className="flex items-center justify-between border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
        {title}
      </h2>
    </div>
  );

  if (!hasData && !loading) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
        {header}
        <div className="flex flex-1 items-center justify-center text-sm text-[#9A9590] px-8 text-center">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
      {/* Edit progress banner */}
      {editing && (
        <div className="absolute inset-x-0 top-0 z-40 overflow-hidden bg-[var(--ink-black)] px-4 py-1.5 text-center text-xs text-white/90">
          {editWaitEstimate && (
            <span
              className="absolute inset-y-0 left-0 bg-white/15 transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.round(editWaitEstimate.progress * 100)}%` }}
            />
          )}
          <span className="relative">
            Applying edit...{editWaitEstimate ? ` ${editWaitEstimate.remainingLabel}` : ""}
          </span>
        </div>
      )}

      {header}

      {loading && !hasData ? (
        <div className="flex-1 px-8 py-10 text-sm text-[#6B6560]">
          {loadingMessage}
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {children}
          </div>
          {onAiEdit && !editing && <WholeTextEditBar onApply={onAiEdit} />}
        </div>
      )}
    </div>
  );
}
