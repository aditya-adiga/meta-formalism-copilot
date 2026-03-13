"use client";

import { useState } from "react";
import type { PanelDef, PanelId } from "@/app/lib/types/panels";

type IconRailProps = {
  panels: PanelDef[];
  activePanelId: PanelId;
  onSelectPanel: (id: PanelId) => void;
  onExportAll?: () => void;
  exportAllDisabled?: boolean;
};

export default function IconRail({ panels, activePanelId, onSelectPanel, onExportAll, exportAllDisabled }: IconRailProps) {
  const [expanded, setExpanded] = useState(false);

  const visiblePanels = panels.filter((p) => !p.hidden);

  return (
    <nav
      className="flex h-full shrink-0 flex-col border-r border-[#DDD9D5] transition-[width] duration-200 ease-in-out"
      style={{
        width: expanded ? "var(--rail-expanded-width)" : "var(--rail-width)",
        background: "var(--rail-bg)",
      }}
      aria-label="Panel navigation"
    >
      {/* Toggle expand/collapse */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center justify-center border-b border-[#DDD9D5] px-3 py-2 text-[#6B6560] hover:text-[var(--ink-black)] transition-colors"
        aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          {expanded
            ? <polyline points="10 3 5 8 10 13" />
            : <polyline points="6 3 11 8 6 13" />
          }
        </svg>
      </button>

      {visiblePanels.map((panel, idx) => {
        const isActive = panel.id === activePanelId;
        const prevPanel = idx > 0 ? visiblePanels[idx - 1] : null;
        const showSeparator = prevPanel && prevPanel.group && panel.group && prevPanel.group !== panel.group;
        return (
          <div key={panel.id}>
          {showSeparator && (
            <div className="mx-3 my-1 border-t border-[#DDD9D5]" />
          )}
          <button
            onClick={() => onSelectPanel(panel.id)}
            title={expanded ? undefined : panel.label}
            className={`
              group relative flex items-center gap-3 px-3 py-3 text-left transition-colors
              ${isActive
                ? "bg-[var(--ivory-cream)] text-[var(--ink-black)]"
                : "text-[#6B6560] hover:bg-[var(--rail-hover)] hover:text-[var(--ink-black)]"
              }
            `}
            aria-current={isActive ? "page" : undefined}
          >
            {/* Active indicator bar */}
            {isActive && (
              <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-[var(--rail-active)]" />
            )}

            {/* Icon — always visible */}
            <span className="flex shrink-0 items-center justify-center w-6 h-6">
              {panel.icon}
            </span>

            {/* Label + status — only when expanded */}
            {expanded && (
              <span className="flex min-w-0 flex-col overflow-hidden">
                <span className="truncate text-xs font-semibold">{panel.label}</span>
                {panel.statusSummary && (
                  <span className="truncate text-[10px] text-[#9A9590]">{panel.statusSummary}</span>
                )}
              </span>
            )}
          </button>
          </div>
        );
      })}

      {/* Spacer pushes export button to bottom */}
      <div className="flex-1" />

      {/* Export All button */}
      {onExportAll && (
        <button
          onClick={onExportAll}
          disabled={exportAllDisabled}
          title={expanded ? undefined : "Export All"}
          className={`
            group flex items-center gap-3 px-3 py-3 text-left transition-colors border-t border-[#DDD9D5]
            text-[#6B6560] hover:bg-[var(--rail-hover)] hover:text-[var(--ink-black)]
            disabled:opacity-40 disabled:pointer-events-none
          `}
        >
          <span className="flex shrink-0 items-center justify-center w-6 h-6">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3v10M6 9l4 4 4-4" />
              <path d="M3 14v2a1 1 0 001 1h12a1 1 0 001-1v-2" />
            </svg>
          </span>
          {expanded && (
            <span className="truncate text-xs font-semibold">Export All</span>
          )}
        </button>
      )}
    </nav>
  );
}
