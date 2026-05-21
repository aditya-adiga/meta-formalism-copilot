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

/** Max papers to send to the integration API */
export const MAX_INTEGRATION_PAPERS = 8;

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
  /** Methodology red flags detected (e.g. p-hacking indicators, small sample) */
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
};

/** An evidence slot attached to one artifact element */
export type EvidenceSlot = {
  targetKey: EvidenceTargetKey;
  searchQueries: string[];
  papers: EvidencePaper[];
  searchedAt: string;
  /** Whether papers in this slot have been scored */
  scored: boolean;
  /** When scoring was last performed (null if never) */
  scoredAt: string | null;
};

/** API request shape for evidence search */
export type EvidenceSearchRequest = {
  artifactType: EvidenceArtifactType;
  elementId: string;
  elementContent: string;
  contextSummary?: string;
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
};

// ---------------------------------------------------------------------------
// Overlap and subsumption detection (Phase 3)
// ---------------------------------------------------------------------------

/** A detected containment relationship between a review paper and an individual study */
export type SubsumptionRelation = {
  /** OpenAlex ID of the review/meta-analysis */
  reviewId: string;
  /** OpenAlex ID of the individual study */
  studyId: string;
  /** How the relationship was detected */
  detectionMethod: "citation-graph" | "llm-fallback";
  /** Confidence in the relationship (0-1) */
  confidence: number;
};

/** Status of a paper relative to reviews in the same evidence slot */
export type PaperOverlapStatus =
  | "subsumed"    // Study is included in a review within the result set
  | "novel"       // Study is newer than the review(s) or not included
  | "review"      // This paper IS a review/meta-analysis
  | "no-reviews"; // No reviews in the set to compare against

/** Study types that count as "review" papers for overlap detection */
export const REVIEW_STUDY_TYPES: readonly StudyType[] = [
  "meta-analysis",
  "systematic-review",
] as const;

/** Check whether a study type is a review type (meta-analysis or systematic-review) */
export function isReviewType(studyType: string | undefined | null): boolean {
  return !!studyType && (REVIEW_STUDY_TYPES as readonly string[]).includes(studyType);
}

/** Overlap analysis result for an evidence slot */
export type OverlapAnalysis = {
  /** All detected containment relationships */
  relations: SubsumptionRelation[];
  /** Per-paper status keyed by openAlexId */
  paperStatus: Record<string, PaperOverlapStatus>;
  /** When analysis was performed */
  analyzedAt: string;
};

/** API request shape for overlap analysis */
export type EvidenceOverlapRequest = {
  /** Papers to analyze — must have reliability scores with studyType */
  papers: Pick<
    EvidencePaper,
    "openAlexId" | "title" | "year" | "abstract" | "reliability"
  >[];
};

/** API response shape for overlap analysis */
export type EvidenceOverlapResponse = {
  analysis: OverlapAnalysis;
};

// ---------------------------------------------------------------------------
// Integration proposals (Phase 4)
// ---------------------------------------------------------------------------

/** Edit category for UI grouping and styling */
export type IntegrationEditType =
  | "update-prior"        // Evidence suggests updating a numeric value or distribution
  | "add-evidence"        // Evidence supports an existing claim (strengthen it)
  | "flag-contradiction"  // Evidence contradicts an existing claim
  | "refine-wording";     // Evidence suggests more precise language

/** A single proposed edit to an artifact field, based on evidence papers */
export type IntegrationProposal = {
  /** Unique ID for this proposal (client-generated) */
  id: string;
  /** Dot-notation path to the field, e.g. "hypotheses[1].statement" or "summary" */
  fieldPath: string;
  /** Human-readable label, e.g. "Hypothesis H1 statement" */
  fieldLabel: string;
  /** The current value of the field (stringified for display) */
  currentValue: string;
  /** The proposed replacement value */
  proposedValue: string;
  /** 1-2 sentence explanation of why this edit is warranted */
  rationale: string;
  /** OpenAlex IDs of papers supporting this proposal */
  paperIds: string[];
  /** User decision: null = pending, true = approved, false = rejected */
  decision: null | boolean;
  /** Edit category */
  editType: IntegrationEditType;
};

/** API request shape for evidence integration */
export type EvidenceIntegrateRequest = {
  artifactType: EvidenceArtifactType;
  /** The full artifact content as JSON string */
  artifactContent: string;
  /** Top papers to generate proposals from */
  papers: Pick<
    EvidencePaper,
    "openAlexId" | "title" | "authors" | "year" | "abstract" | "reliability" | "relatedness"
  >[];
};

/** Shape returned by the LLM (before client adds id + decision) */
export type RawIntegrationProposal = Omit<IntegrationProposal, "id" | "decision">;

/** API response shape for evidence integration */
export type EvidenceIntegrateResponse = {
  proposals: RawIntegrationProposal[];
};
