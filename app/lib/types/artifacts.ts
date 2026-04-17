import type { BuiltinArtifactType } from "./session";

/** Uniform request shape for all new artifact generation routes (003 §2) */
export type ArtifactGenerationRequest = {
  sourceText: string;
  context: string;
  nodeId?: string;
  nodeLabel?: string;
  previousAttempt?: string;
  instruction?: string;
};

/** Causal Graph response shape (003 §3) */
export type CausalGraphResponse = {
  causalGraph: {
    variables: Array<{
      id: string;
      label: string;
      description: string;
    }>;
    edges: Array<{
      from: string;
      to: string;
      weight: number;
      mechanism: string;
    }>;
    confounders: Array<{
      id: string;
      label: string;
      affectedEdges: string[];
    }>;
    summary: string;
  };
};

/** Uniform verification response shape for all artifact types (003 §6) */
export type ArtifactVerificationResponse = {
  valid: boolean;
  issues: Array<{
    severity: "error" | "warning" | "info";
    description: string;
    location?: string;
  }>;
  summary: string;
};

/** Statistical Model response shape (003 §3) */
export type StatisticalModelResponse = {
  statisticalModel: {
    variables: Array<{
      id: string;
      label: string;
      role: "independent" | "dependent" | "confounding" | "control";
      distribution?: string;
    }>;
    hypotheses: Array<{
      id: string;
      statement: string;
      nullHypothesis: string;
      testSuggestion: string;
    }>;
    assumptions: string[];
    sampleRequirements?: string;
    summary: string;
  };
};

/** Property Tests response shape (003 §3) */
export type PropertyTestsResponse = {
  propertyTests: {
    properties: Array<{
      id: string;
      name: string;
      description: string;
      preconditions: string;
      postcondition: string;
      pseudocode: string;
    }>;
    dataGenerators: Array<{
      name: string;
      description: string;
      constraints: string;
    }>;
    summary: string;
  };
};

/** Dialectical Map response shape (003 §3) */
export type BalancedPerspectivesResponse = {
  balancedPerspectives: DialecticalMapResponse["dialecticalMap"];
};

export type DialecticalMapResponse = {
  dialecticalMap: {
    topic: string;
    perspectives: Array<{
      id: string;
      label: string;
      coreClaim: string;
      supportingArguments: string[];
      vulnerabilities: string[];
    }>;
    tensions: Array<{
      between: [string, string];
      description: string;
    }>;
    synthesis: {
      equilibrium: string;
      howAddressed: Array<{
        perspectiveId: string;
        resolution: string;
      }>;
    };
    summary: string;
  };
};

/** Counterexamples response shape */
export type CounterexamplesResponse = {
  counterexamplesAnalysis: {
    claim: string;
    scenarios: Array<{
      id: string;
      scenario: string;
      targetAssumption: string;
      explanation: string;
      plausibility: "high" | "medium" | "low";
      isEmpirical?: boolean;
    }>;
    robustnessAssessment: string;
    summary: string;
  };
};

/** Display metadata for each built-in artifact type */
export const ARTIFACT_META: Record<BuiltinArtifactType, {
  label: string;
  chipLabel: string;
  description: string;
  whenToUse: string;
}> = {
  semiformal: {
    label: "Step-by-Step Proof",
    chipLabel: "Mathematical Proof",
    description: "Creates a structured proof with mathematical notation. Spells out individual logical steps, building toward a computer-checkable Lean 4 proof.",
    whenToUse: "Claims that already have a precise statement, where the accuracy of specific equations and reasoning steps needs rigorous validation.",
  },
  lean: {
    label: "Proof Code",
    chipLabel: "Proof Code",
    description: "Computer-checkable proof code (Lean 4) that can be automatically verified for correctness.",
    whenToUse: "Generated automatically as step 2 of the proof process.",
  },
  "causal-graph": {
    label: "Cause & Effect Map",
    chipLabel: "Cause & Effect Map",
    description: "A visual map of factors and how they influence each other. Each connection is positively or negatively weighted to show strength and direction of the relationship.",
    whenToUse: "Reasoning about cause-and-effect or ‘what if’ questions. Text with multiple inter-related ideas that should be considered simultaneously.",
  },
  "statistical-model": {
    label: "Statistical Model",
    chipLabel: "Statistical Model",
    description: "Identifies key factors and their roles, generates testable predictions with baseline assumptions, and suggests appropriate data tests matched to the structure of the predictions.",
    whenToUse: "Claims involving measurable quantities or evidence testable with data. When designing a study and choosing what data to collect. When multiple sources of evidence need to be weighed against one another. When the level of confidence in a claim matters.",
  },
  "property-tests": {
    label: "Consistency Checks",
    chipLabel: "Consistency Checks",
    description: "Isolates rules or features that should always remain true. States them as checkable conditions (what must be true before, what’s guaranteed after) and generates test code you can adapt for a project.",
    whenToUse: "Rules or guarantees that should never be violated, especially for software or algorithmic claims. Test-driven development.",
  },
  "balanced-perspectives": {
    label: "Balanced Perspectives",
    chipLabel: "Balanced Perspectives",
    description: "Identifies distinct viewpoints in the source text, highlights tensions between them, and proposes a balanced resolution that addresses each perspective.",
    whenToUse: "Topics with multiple valid viewpoints where you want the full landscape of opinions. Decisions with many stakeholders who may have different values. When you want to understand disagreements or reduce bias.",
  },
  counterexamples: {
    label: "Counterexamples",
    chipLabel: "Counterexamples",
    description: "Searches for specific scenarios that could challenge or disprove the claim, each rated by how plausible it is.",
    whenToUse: "Stress-testing a claim by looking for exceptions or conditions where it breaks down. When a proof fails and you don’t understand why. When statistical evidence is strong but doesn’t create certainty. When you need to challenge a specific perspective.",
  },
};

/** Built-in artifact types selectable as chips (lean excluded — it's step 2 of the deductive pipeline) */
export const SELECTABLE_ARTIFACT_TYPES: BuiltinArtifactType[] = [
  "semiformal",
  "causal-graph",
  "statistical-model",
  "property-tests",
  "balanced-perspectives",
  "counterexamples",
];

/** Maps built-in artifact types to their API route paths */
export const ARTIFACT_ROUTE: Partial<Record<BuiltinArtifactType, string>> = {
  "causal-graph": "/api/formalization/causal-graph",
  "statistical-model": "/api/formalization/statistical-model",
  "property-tests": "/api/formalization/property-tests",
  "balanced-perspectives": "/api/formalization/balanced-perspectives",
  counterexamples: "/api/formalization/counterexamples",
};

/** Maps built-in artifact types to their JSON response field name (varies by type; not a mechanical conversion) */
export const ARTIFACT_RESPONSE_KEY: Record<BuiltinArtifactType, string> = {
  semiformal: "proof",
  lean: "leanCode",
  "causal-graph": "causalGraph",
  "statistical-model": "statisticalModel",
  "property-tests": "propertyTests",
  "balanced-perspectives": "balancedPerspectives",
  counterexamples: "counterexamplesAnalysis",
};
