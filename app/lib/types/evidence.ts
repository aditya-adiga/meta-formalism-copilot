/** Types for the evidence grounding system.
 *
 * Evidence slots attach external academic papers to individual elements
 * within statistical-model and counterexamples artifacts. Each paper
 * carries per-paper reliability and relatedness scores from LLM assessment. */

import type { ArtifactType } from "./session";

/** Artifact types that support evidence search (runtime array, single source of truth) */
export const EVIDENCE_ARTIFACT_TYPES = ["statistical-model", "counterexamples"] as const;
export type EvidenceArtifactType = Extract<ArtifactType, (typeof EVIDENCE_ARTIFACT_TYPES)[number]>;

/** Identifies which artifact element an evidence slot is attached to */
export type EvidenceTargetKey = {
  artifactType: EvidenceArtifactType;
  elementId: string;
};

/** Element ID used when evidence applies to the whole artifact (not a sub-element) */
export const WHOLE_ARTIFACT_ELEMENT_ID = "artifact";

/** Serializes a target key for use as a Record key */
export function serializeTargetKey(target: EvidenceTargetKey): string {
  return `${target.artifactType}::${target.elementId}`;
}

// ---------------------------------------------------------------------------
// Study type hierarchy (ordered from most to least reliable)
// ---------------------------------------------------------------------------

/** Study types ordered by evidence strength, from strongest to weakest.
 *  Matches the hierarchy from the evidence grounding design:
 *  meta-analysis > systematic-review > RCT > cohort > case-control >
 *  cross-sectional > case-study > expert-opinion > unknown */
export const STUDY_TYPES = [
  "meta-analysis",
  "systematic-review",
  "rct",
  "cohort",
  "case-control",
  "cross-sectional",
  "case-study",
  "expert-opinion",
  "unknown",
] as const;
export type StudyType = (typeof STUDY_TYPES)[number];

/** Human-readable labels for study types */
export const STUDY_TYPE_LABELS: Record<StudyType, string> = {
  "meta-analysis": "Meta-analysis",
  "systematic-review": "Systematic Review",
  "rct": "RCT",
  "cohort": "Cohort Study",
  "case-control": "Case-Control",
  "cross-sectional": "Cross-sectional",
  "case-study": "Case Study",
  "expert-opinion": "Expert Opinion",
  "unknown": "Unknown",
};

// ---------------------------------------------------------------------------
// Paper lifecycle status
// ---------------------------------------------------------------------------

/** Lifecycle status of a paper within a slot. Reflects a step that HAS
 *  happened (a read-out), not a manual cause:
 *   - retrieved:  default when search returns it
 *   - evaluated:  set automatically when reliability/relatedness scoring lands
 *   - integrated: reserved — no setter yet (artifact integration not built)
 *   - pruned:     user dismissed it (soft; recoverable, survives re-runs)
 *  Status keys off the slot (= one claim), so it already models per-(paper,
 *  claim) status and a future shared-paper-pool view can reuse this type. */
export const EVIDENCE_PAPER_STATUSES = [
  "retrieved",
  "evaluated",
  "integrated",
  "pruned",
] as const;
export type EvidencePaperStatus = (typeof EVIDENCE_PAPER_STATUSES)[number];

// ---------------------------------------------------------------------------
// Paper scoring
// ---------------------------------------------------------------------------

/** LLM-assessed reliability indicators for a paper */
export type ReliabilityScore = {
  /** Overall reliability score 0-1 (higher = more reliable) */
  score: number;
  /** Classified study type */
  studyType: StudyType;
  /** Brief explanation of the reliability assessment */
  rationale: string;
  /** Methodology red flags detected (e.g. small sample, conflicts of interest,
   *  retraction notices) — see the scoring prompt in app/api/evidence-score/route.ts
   *  for the exact set the LLM is instructed to surface. */
  redFlags: string[];
};

/** LLM-assessed relatedness to the original claim */
export type RelatednessScore = {
  /** Overall relatedness score 0-1 (higher = more relevant) */
  score: number;
  /** Brief explanation of how the paper relates to the claim */
  rationale: string;
};

/** A single paper result from OpenAlex, with optional scoring */
export type EvidencePaper = {
  openAlexId: string;
  title: string;
  authors: string[];
  year: number | null;
  abstract: string | null;
  citedByCount: number;
  journal: string | null;
  doi: string | null;
  oaUrl: string | null;
  /** Per-paper reliability assessment (null until scored) */
  reliability: ReliabilityScore | null;
  /** Per-paper relatedness to the claim (null until scored) */
  relatedness: RelatednessScore | null;
  /** Lifecycle status within this slot (see EvidencePaperStatus) */
  status: EvidencePaperStatus;
};

/** An evidence slot attached to one artifact element.
 *  Whether the slot is "scored" is derived from the papers (see isSlotScored),
 *  not stored, so the two cannot drift apart in persisted state. */
export type EvidenceSlot = {
  targetKey: EvidenceTargetKey;
  searchQueries: string[];
  papers: EvidencePaper[];
  searchedAt: string;
  /** When scoring was last performed (null if never) */
  scoredAt: string | null;
};

/** Whether every *active* (non-pruned) paper in a slot has been scored.
 *  Pruned papers are intentionally never scored, so they must not block the
 *  slot's "scored" state. Derived from the papers (not stored) so it cannot
 *  drift from the actual scores. */
export function isSlotScored(slot: EvidenceSlot): boolean {
  const active = slot.papers.filter((p) => p.status !== "pruned");
  return active.length > 0 && active.every((p) => p.reliability !== null);
}

/** API request shape for evidence search */
export type EvidenceSearchRequest = {
  artifactType: EvidenceArtifactType;
  elementId: string;
  elementContent: string;
  contextSummary?: string;
  /** When present and non-empty, search these queries directly instead of
   *  generating them via the LLM. Sanitized server-side. */
  queries?: string[];
};

/** API response shape for evidence search */
export type EvidenceSearchResponse = {
  queries: string[];
  papers: EvidencePaper[];
};

/** API request shape for evidence scoring */
export type EvidenceScoreRequest = {
  /** The claim/element content that papers are being scored against */
  claimContent: string;
  /** Papers to score */
  papers: Pick<EvidencePaper, "openAlexId" | "title" | "authors" | "year" | "abstract" | "journal">[];
};

/** Per-paper scoring result from the LLM */
export type PaperScore = {
  openAlexId: string;
  reliability: ReliabilityScore;
  relatedness: RelatednessScore;
};

/** API response shape for evidence scoring */
export type EvidenceScoreResponse = {
  scores: PaperScore[];
  /** True when `scores` are neutral placeholders returned because no LLM
   *  provider key is configured. Consumers must not treat these as a real
   *  assessment. */
  mock?: boolean;
};
