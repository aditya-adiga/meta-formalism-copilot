"use client";

import { useState } from "react";
import type { PanelDef, PanelId } from "@/app/lib/types/panels";

type IconRailProps = {
  panels: PanelDef[];
  activePanelId: PanelId;
  onSelectPanel: (id: PanelId) => void;
};

export default function IconRail({ panels, activePanelId, onSelectPanel }: IconRailProps) {
  const [expanded, setExpanded] = useState(false);

  const visiblePanels = panels.filter((p) => !p.hidden);

  return (
    <nav
      className="flex h-full shrink-0 flex-col border-r border-[#DDD9D5] transition-[width] duration-200 ease-in-out"
      style={{
        width: expanded ? "var(--rail-expanded-width)" : "var(--rail-width)",
        background: "var(--rail-bg)",
      }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      aria-label="Panel navigation"
    >
      {visiblePanels.map((panel) => {
        const isActive = panel.id === activePanelId;
        return (
          <button
            key={panel.id}
            onClick={() => onSelectPanel(panel.id)}
            title={panel.label}
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
        );
      })}
    </nav>
  );
}
