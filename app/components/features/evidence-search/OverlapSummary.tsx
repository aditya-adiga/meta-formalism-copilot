"use client";

import type { OverlapAnalysis } from "@/app/lib/types/evidence";

/**
 * Compact summary bar showing overlap analysis counts.
 * Displayed above the paper list when overlap analysis exists.
 */
export default function OverlapSummary({ analysis }: { analysis: OverlapAnalysis }) {
  const statusValues = Object.values(analysis.paperStatus);
  const reviewCount = statusValues.filter((s) => s === "review").length;
  const subsumedCount = statusValues.filter((s) => s === "subsumed").length;
  const novelCount = statusValues.filter((s) => s === "novel").length;

  if (reviewCount === 0) return null;

  const parts: string[] = [];
  if (subsumedCount > 0) {
    parts.push(
      `${subsumedCount} ${subsumedCount === 1 ? "study" : "studies"} subsumed by ${reviewCount} ${reviewCount === 1 ? "review" : "reviews"}`,
    );
  }
  if (novelCount > 0) {
    parts.push(
      `${novelCount} novel ${novelCount === 1 ? "study" : "studies"}`,
    );
  }
  if (parts.length === 0) {
    parts.push(`${reviewCount} ${reviewCount === 1 ? "review" : "reviews"}, no individual studies`);
  }

  return (
    <div className="text-[10px] text-[#6B6560] bg-[#F5F1ED] border border-[#DDD9D5] rounded px-2 py-1 mb-2">
      {parts.join(", ")}
    </div>
  );
}
