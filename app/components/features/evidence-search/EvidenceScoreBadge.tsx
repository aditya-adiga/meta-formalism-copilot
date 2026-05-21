"use client";

/**
 * Small color-coded badge for displaying a 0-1 score.
 *
 * Colors follow a traffic-light scheme:
 * - green (>= 0.7): strong evidence / high relevance
 * - amber (>= 0.4): moderate
 * - red (< 0.4): weak / low relevance
 */

type EvidenceScoreBadgeProps = {
  /** Short label (e.g. "Rel" for reliability, "Fit" for relatedness) */
  label: string;
  /** Score between 0 and 1 */
  score: number;
  /** Tooltip text shown on hover */
  tooltip?: string;
};

function scoreColor(score: number): string {
  if (score >= 0.7) return "text-green-700 bg-green-50 border-green-200";
  if (score >= 0.4) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-red-700 bg-red-50 border-red-200";
}

export default function EvidenceScoreBadge({ label, score, tooltip }: EvidenceScoreBadgeProps) {
  const displayScore = Math.round(score * 100);
  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-0.5 rounded border px-1 py-0.5 text-[10px] font-mono cursor-default ${scoreColor(score)}`}
    >
      <span className="font-medium">{label}</span>
      <span>{displayScore}</span>
    </span>
  );
}
