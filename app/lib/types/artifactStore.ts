/**
 * Types for the artifact versioning layer in the Zustand workspace store.
 *
 * Each structured artifact (causal-graph, statistical-model, etc.) is stored
 * as an ArtifactRecord with a version history. This enables undo/redo and
 * preserves user edits across regeneration cycles.
 */

import type { ArtifactType } from "./session";
import type { GenerationProvenance } from "@/app/lib/utils/provenance";

/** Subset of ArtifactType that uses structured JSON and the versioned store.
 *  Semiformal and lean are stored as flat string fields for pipeline compatibility. */
export type ArtifactKey = Exclude<ArtifactType, "semiformal" | "lean">;

export type ArtifactVersion = {
  id: string;
  content: string;
  createdAt: string;
  source: "generated" | "ai-edit" | "manual-edit";
  editInstruction?: string;
  /** Hash of the inputs used to generate this version (absent for pre-provenance data) */
  provenance?: GenerationProvenance;
};

export type ArtifactRecord = {
  type: ArtifactKey;
  currentVersionIndex: number; // pointer into versions[]
  versions: ArtifactVersion[]; // oldest-first, capped at MAX_VERSIONS
};

/** Provenance tracks which inputs produced a given artifact version.
 *  Used for staleness detection (Phase 3). */
export type GenerationProvenance = {
  sourceHash: string;
  contextHash: string;
  generatedAt: string;
};

export const MAX_VERSIONS = 20;
