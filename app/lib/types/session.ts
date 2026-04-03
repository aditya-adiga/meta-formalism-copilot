export type VerificationStatus = "none" | "verifying" | "valid" | "invalid";
export type LoadingPhase = "idle" | "semiformal" | "lean" | "verifying" | "retrying" | "reverifying" | "iterating";

export type SessionScope =
  | { type: "global" }
  | { type: "node"; nodeId: string; nodeLabel: string };

export type ArtifactType =
  | "semiformal"
  | "lean"
  | "causal-graph"
  | "statistical-model"
  | "property-tests"
  | "balanced-perspectives"
  | "counterexamples";

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
