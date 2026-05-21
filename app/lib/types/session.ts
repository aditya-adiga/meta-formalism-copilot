export type VerificationStatus = "none" | "verifying" | "valid" | "invalid" | "unavailable";
export type LoadingPhase = "idle" | "semiformal" | "lean" | "verifying" | "retrying" | "reverifying" | "iterating";

export type SessionScope =
  | { type: "global" }
  | { type: "node"; nodeId: string; nodeLabel: string };

import type { CustomArtifactTypeId } from "./customArtifact";

/** The fixed set of artifact types shipped with the app. */
export type BuiltinArtifactType =
  | "semiformal"
  | "lean"
  | "causal-graph"
  | "statistical-model"
  | "property-tests"
  | "balanced-perspectives"
  | "counterexamples";

/** Any artifact type — built-in or user-defined custom type. */
export type ArtifactType = BuiltinArtifactType | CustomArtifactTypeId;

export type ArtifactData = {
  type: ArtifactType;
  content: string; // JSON-stringified for structured types, raw text for semiformal/lean
  generatedAt: string;
  verificationStatus: VerificationStatus;
  verificationErrors: string;
};

export type FormalizationSession = {
  id: string;
  runNumber: number;
  createdAt: string;
  updatedAt: string;
  scope: SessionScope;
  // Legacy deductive-only fields (will migrate to artifacts[] in a follow-up)
  semiformalText: string;
  leanCode: string;
  verificationStatus: VerificationStatus;
  verificationErrors: string;
  // New: multi-artifact support (defaults to [] until migration)
  artifacts: ArtifactData[];
};

export type SessionsState = {
  sessions: FormalizationSession[];
  activeSessionId: string | null;
};
