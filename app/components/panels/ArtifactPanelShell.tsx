"use client";

import type { ReactNode } from "react";

type ArtifactPanelShellProps = {
  title: string;
  loading?: boolean;
  hasData: boolean;
  emptyMessage: string;
  loadingMessage: string;
  children: ReactNode;
};

/**
 * Shared shell for artifact panels (causal graph, statistical model, etc.).
 * Handles the outer container, header bar, empty state, and loading state.
 */
export default function ArtifactPanelShell({
  title,
  loading,
  hasData,
  emptyMessage,
  loadingMessage,
  children,
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
      {header}
      {loading && !hasData ? (
        <div className="flex-1 px-8 py-10 text-sm text-[#6B6560]">
          {loadingMessage}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {children}
        </div>
      )}
    </div>
  );
}
