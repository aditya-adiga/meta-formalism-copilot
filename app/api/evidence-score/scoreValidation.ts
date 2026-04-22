/**
 * Validation and normalization helpers for LLM-generated evidence scores.
 *
 * Extracted from the route handler so they can be unit-tested independently.
 */

import {
  STUDY_TYPES,
  type PaperScore,
  type StudyType,
} from "@/app/lib/types/evidence";

/** Clamp a score to [0, 1] */
export function clampScore(score: unknown): number {
  const n = typeof score === "number" && isFinite(score) ? score : 0;
  return Math.max(0, Math.min(1, n));
}

/** Validate and normalize a study type string */
export function normalizeStudyType(raw: unknown): StudyType {
  if (typeof raw === "string" && (STUDY_TYPES as readonly string[]).includes(raw)) {
    return raw as StudyType;
  }
  return "unknown";
}

/** Validate and clean a single paper score from LLM output.
 *  Returns null if the score is structurally invalid (missing openAlexId). */
export function validatePaperScore(raw: Record<string, unknown>): PaperScore | null {
  if (!raw.openAlexId || typeof raw.openAlexId !== "string") return null;

  const rel = raw.reliability as Record<string, unknown> | undefined;
  const relat = raw.relatedness as Record<string, unknown> | undefined;

  return {
    openAlexId: raw.openAlexId,
    reliability: {
      score: clampScore(rel?.score),
      studyType: normalizeStudyType(rel?.studyType),
      rationale: typeof rel?.rationale === "string" ? rel.rationale : "",
      redFlags: Array.isArray(rel?.redFlags)
        ? (rel.redFlags as unknown[]).filter((f): f is string => typeof f === "string")
        : [],
    },
    relatedness: {
      score: clampScore(relat?.score),
      rationale: typeof relat?.rationale === "string" ? relat.rationale : "",
    },
  };
}
