export type SessionScope =
  | { type: "global" }
  | { type: "node"; nodeId: string; nodeLabel: string };

export type FormalizationSession = {
  id: string;
  runNumber: number;
  createdAt: string;
  updatedAt: string;
  scope: SessionScope;
  semiformalText: string;
  leanCode: string;
  verificationStatus: "none" | "verifying" | "valid" | "invalid";
  verificationErrors: string;
};

export type SessionsState = {
  sessions: FormalizationSession[];
  activeSessionId: string | null;
};
