"use client";

import type { PanelId, SplitOrientation } from "@/app/lib/types/panels";
import FocusPane from "@/app/components/layout/FocusPane";

type SplitPaneProps = {
  primaryPanelId: PanelId;
  secondaryPanelId: PanelId;
  orientation: SplitOrientation;
  renderPanel: (id: PanelId) => React.ReactNode;
  onCloseSecondary: () => void;
  onToggleOrientation: () => void;
};

const dividerButtonClass =
  "flex items-center justify-center w-6 h-6 rounded text-[#6B6560] hover:bg-[var(--rail-hover)] hover:text-[var(--ink-black)] transition-colors";

export default function SplitPane({
  primaryPanelId,
  secondaryPanelId,
  orientation,
  renderPanel,
  onCloseSecondary,
  onToggleOrientation,
}: SplitPaneProps) {
  const isHorizontal = orientation === "horizontal";

  return (
    <div
      className={`flex min-h-0 min-w-0 flex-1 overflow-hidden ${
        isHorizontal ? "flex-row" : "flex-col"
      }`}
    >
      <FocusPane activePanelId={primaryPanelId} renderPanel={renderPanel} />

      <div
        className={`group relative flex shrink-0 items-center justify-center ${
          isHorizontal ? "w-3 flex-col" : "h-3 flex-row"
        }`}
      >
        <div
          className={`absolute bg-[var(--border-light)] ${
            isHorizontal
              ? "left-1/2 top-0 bottom-0 w-px -translate-x-1/2"
              : "top-1/2 left-0 right-0 h-px -translate-y-1/2"
          }`}
        />

        <div
          className={`absolute z-10 flex gap-1 rounded bg-[var(--rail-bg)] p-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity ${
            isHorizontal ? "flex-col" : "flex-row"
          }`}
        >
          <button
            onClick={onToggleOrientation}
            title={isHorizontal ? "Switch to top/bottom split" : "Switch to left/right split"}
            className={dividerButtonClass}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              {isHorizontal ? (
                <>
                  <rect x="1" y="1" width="12" height="5" rx="1" />
                  <rect x="1" y="8" width="12" height="5" rx="1" />
                </>
              ) : (
                <>
                  <rect x="1" y="1" width="5" height="12" rx="1" />
                  <rect x="8" y="1" width="5" height="12" rx="1" />
                </>
              )}
            </svg>
          </button>
          <button
            onClick={onCloseSecondary}
            title="Close split view"
            className={dividerButtonClass}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="3" x2="11" y2="11" />
              <line x1="11" y1="3" x2="3" y2="11" />
            </svg>
          </button>
        </div>
      </div>

      <FocusPane activePanelId={secondaryPanelId} renderPanel={renderPanel} />
    </div>
  );
}
