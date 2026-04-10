/** Types for the evidence grounding system (Phase 1).
 *
 * Evidence slots attach external academic papers to individual elements
 * within statistical-model and counterexamples artifacts. The `reliability`
 * and `relatedness` fields are reserved for Phase 2 scoring. */

import type { ArtifactType } from "./session";

/** Artifact types that support evidence search */
export type EvidenceArtifactType = Extract<ArtifactType, "statistical-model" | "counterexamples">;

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

/** A single paper result from OpenAlex */
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
};

/** An evidence slot attached to one artifact element */
export type EvidenceSlot = {
  targetKey: EvidenceTargetKey;
  searchQueries: string[];
  papers: EvidencePaper[];
  searchedAt: string;
  /** Phase 2: LLM-assessed reliability score (null until scored) */
  reliability: number | null;
  /** Phase 2: LLM-assessed relatedness score (null until scored) */
  relatedness: number | null;
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
