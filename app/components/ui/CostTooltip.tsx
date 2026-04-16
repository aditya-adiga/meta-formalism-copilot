"use client";

import { useState, useRef, useCallback, type ReactNode } from "react";
import { estimateCost } from "@/app/lib/llm/costs";

const WARN_THRESHOLD_USD = 0.10;

function formatCost(usd: number): string {
  if (usd < 0.005) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

type CostTooltipProps = {
  /** Character length of the input that will be sent to the LLM. */
  inputCharLength: number;
  /** Artifact types this action will generate (used for per-endpoint cost estimates). */
  artifactTypes?: string[];
  children: ReactNode;
};

/**
 * Wraps a button and shows an estimated cost on hover.
 * Uses per-endpoint median output token estimates (see docs/decisions/007).
 * Displays a warning style when the estimate exceeds $0.10.
 */
export default function CostTooltip({
  inputCharLength,
  artifactTypes,
  children,
}: CostTooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    // Small delay to avoid flickering on fast mouse-throughs
    timeoutRef.current = setTimeout(() => setVisible(true), 200);
  }, []);

  const hide = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  }, []);

  const cost = estimateCost(inputCharLength, artifactTypes);
  const isWarning = cost >= WARN_THRESHOLD_USD;

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          className={`absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium shadow-md ${isWarning
              ? "border border-amber-300 bg-amber-50 text-amber-800"
              : "bg-[var(--ink-black)] text-white"
            }`}
        >
          {isWarning && (
            <span className="mr-1" aria-label="warning">&#x26A0;</span>
          )}
          Est. {formatCost(cost)}
        </div>
      )}
    </div>
  );
}
