# 003: Artifact Generation API Contracts

**Date:** 2026-03-06

**Status:** Proposed

**Context:** Decision [001](001-formal-artifact-types.md) introduced four new artifact types. Decision [002](002-multi-artifact-ui-layout.md) designed the frontend layout for selecting and displaying them. This decision defines the backend API contracts — route structure, request/response shapes, verification strategies, and how the session and data models evolve to support multiple artifact types.

The existing backend follows a clear pattern: each API route is a Next.js route handler at `app/api/<domain>/<action>/route.ts` that calls `callLlm()` with a system prompt and user content, returning a domain-specific response shape. The existing formalization pipeline is sequential: `formalization/semiformal` produces prose, `formalization/lean` converts that prose to code, and `verification/lean` checks the code against a verifier service. Each step depends on the previous step's output.

The four new artifact types (causal graph, statistical model, property test suite, dialectical map) are fundamentally different: they are **independent of each other and independent of the existing deductive pipeline**. A causal graph is not derived from a semiformal proof. This independence is the key architectural fact driving the API design.

## Decision

### 1. One Route Per Artifact Type

Each artifact type gets its own generation route under `app/api/formalization/`:

```
app/api/formalization/
  semiformal/route.ts        # existing — produces semiformal prose
  lean/route.ts              # existing — converts semiformal to Lean4
  causal-graph/route.ts      # new
  statistical-model/route.ts # new
  property-tests/route.ts    # new
  dialectical-map/route.ts   # new
```

**Why not a single `/formalization/generate` route with a `type` parameter:** Each artifact type has a different system prompt, different response shape, and different post-processing needs. A single route would become a large switch statement. Separate routes follow the existing pattern and keep each route handler focused.

### 2. Uniform Request Shape

All four new routes accept the same request body:

```typescript
type ArtifactGenerationRequest = {
  sourceText: string;       // the raw input text (or node statement)
  context: string;          // formalism context (global or per-node override)
  nodeId?: string;          // if generating for a decomposed node
  nodeLabel?: string;       // human-readable node label
  previousAttempt?: string; // for regeneration/refinement
  instruction?: string;     // additional user instruction (e.g., from edit bar)
};
```

This mirrors the existing `formalization/semiformal` route's implicit contract (`{ text }`) but makes context explicit. The existing semiformal route currently receives context embedded in the `text` field by the frontend; the new routes receive it as a separate field so the system prompt can use it distinctly from the source material.

**Migration note:** The existing `formalization/semiformal` route should eventually adopt this shape too, but that's a separate refactor — not required for the initial implementation.

### 3. Artifact-Specific Response Shapes

Each route returns a response tailored to its artifact type:

#### Causal Graph

```typescript
type CausalGraphResponse = {
  causalGraph: {
    variables: Array<{
      id: string;
      label: string;
      description: string;
    }>;
    edges: Array<{
      from: string;       // variable id
      to: string;         // variable id
      weight: number;     // -1 to 1 (strength and direction)
      mechanism: string;  // brief explanation of the causal pathway
    }>;
    confounders: Array<{
      id: string;
      label: string;
      affectedEdges: string[];  // edge indices or "from->to" keys
    }>;
    summary: string;      // natural language summary of the causal structure
  };
};
```

The LLM returns JSON. The route parses and validates it (same pattern as `decomposition/extract`).

#### Statistical Model

```typescript
type StatisticalModelResponse = {
  statisticalModel: {
    variables: Array<{
      id: string;
      label: string;
      role: "independent" | "dependent" | "confounding" | "control";
      distribution?: string;    // e.g., "Normal(0, 1)", "Bernoulli(0.3)"
    }>;
    hypotheses: Array<{
      id: string;
      statement: string;        // e.g., "X is positively correlated with Y"
      nullHypothesis: string;
      testSuggestion: string;   // e.g., "two-sample t-test"
    }>;
    assumptions: string[];      // e.g., "independence of observations"
    sampleRequirements?: string;
    summary: string;
  };
};
```

#### Property Test Suite

```typescript
type PropertyTestsResponse = {
  propertyTests: {
    properties: Array<{
      id: string;
      name: string;            // e.g., "sortPreservesLength"
      description: string;     // what this property checks
      preconditions: string;   // input constraints
      postcondition: string;   // what must hold
      pseudocode: string;      // executable-style specification
    }>;
    dataGenerators: Array<{
      name: string;
      description: string;     // how to generate test inputs
      constraints: string;
    }>;
    summary: string;
  };
};
```

Property tests return pseudocode specifications, not runnable code in a specific language. This aligns with 001's principle that the tool produces specifications, not implementations.

#### Dialectical Map

```typescript
type DialecticalMapResponse = {
  dialecticalMap: {
    topic: string;
    perspectives: Array<{
      id: string;
      label: string;           // e.g., "Utilitarian", "Deontological"
      coreClaim: string;
      supportingArguments: string[];
      vulnerabilities: string[];
    }>;
    tensions: Array<{
      between: [string, string];  // perspective ids
      description: string;
    }>;
    synthesis: {
      equilibrium: string;     // the synthesized position
      howAddressed: Array<{
        perspectiveId: string;
        resolution: string;    // how this perspective's concern is addressed
      }>;
    };
    summary: string;
  };
};
```

### 4. All New Artifact Types Are Generated Directly from Source

Unlike the deductive pipeline (source -> semiformal -> Lean), the four new artifact types are each generated in a **single LLM call** directly from the source text + context. There is no intermediate representation step.

```
Deductive:    source + context  ->  semiformal  ->  lean  ->  verify
Causal:       source + context  ->  causal graph  ->  verify (consistency)
Statistical:  source + context  ->  statistical model  ->  verify (consistency)
Constructive: source + context  ->  property tests  ->  verify (structural)
Dialectical:  source + context  ->  dialectical map  ->  verify (coverage)
```

This means the frontend can fire all selected artifact generation calls **in parallel**. There is no dependency between artifact types. The only sequential dependency that exists is within the deductive pipeline (semiformal must complete before Lean generation).

### 5. Frontend Calls Artifact Routes in Parallel

When the user selects multiple chips and clicks "Formalise," the frontend fires one `POST` per selected artifact type simultaneously. Each call is independent; partial failure is expected and handled:

- Each artifact type gets its own loading state: `"idle" | "generating" | "done" | "error"`
- If one fails, the others still complete. The failed artifact shows an error in its panel.
- The "Formalise" button becomes disabled while any artifact is generating. Individual panels show their own loading/error states.

This resolves 002's open question about parallel vs. sequential generation and partial failure handling.

### 6. Verification Routes (Future, Stubbed)

Each artifact type has a distinct verification strategy, but verification is **deferred to a follow-up implementation**. The initial implementation generates artifacts without verification. The routes are documented here so the response shapes can accommodate verification results later.

Planned verification routes:

```
app/api/verification/
  lean/route.ts                  # existing — calls external Lean verifier
  causal-consistency/route.ts    # future — LLM-based consistency check
  statistical-consistency/route.ts # future — LLM-based assumption check
  property-structural/route.ts   # future — structural completeness check
  dialectical-coverage/route.ts  # future — LLM-based coverage check
```

All four new verification strategies are **LLM-based** (unlike Lean verification which uses an external tool). This means they can follow the same `callLlm()` pattern: send the artifact as user content with a verification-focused system prompt, receive a structured assessment.

Verification response shape (uniform across types):

```typescript
type ArtifactVerificationResponse = {
  valid: boolean;
  issues: Array<{
    severity: "error" | "warning" | "info";
    description: string;
    location?: string;     // artifact-specific pointer (e.g., edge id, property name)
  }>;
  summary: string;
};
```

### 7. Session Model Changes

`FormalizationSession` currently tracks only the deductive pipeline (semiformal + lean). It needs to expand to track all artifact types.

```typescript
export type ArtifactType =
  | "semiformal"
  | "lean"
  | "causal-graph"
  | "statistical-model"
  | "property-tests"
  | "dialectical-map";

export type ArtifactData = {
  type: ArtifactType;
  content: string;          // JSON-stringified for structured types, raw text for semiformal/lean
  generatedAt: string;
  verificationStatus: "none" | "verifying" | "valid" | "invalid";
  verificationErrors: string;
};

export type FormalizationSession = {
  id: string;
  runNumber: number;
  createdAt: string;
  updatedAt: string;
  scope: SessionScope;
  artifacts: ArtifactData[];   // replaces semiformalText, leanCode, verificationStatus, verificationErrors
  // Deprecated fields kept for migration:
  semiformalText?: string;
  leanCode?: string;
  verificationStatus?: "none" | "verifying" | "valid" | "invalid";
  verificationErrors?: string;
};
```

A migration function in `useFormalizationSessions` converts old sessions (with top-level `semiformalText`/`leanCode`) into the new `artifacts` array on load.

### 8. PropositionNode Changes

`PropositionNode` currently has `semiformalProof`, `leanCode`, `verificationStatus`, and `verificationErrors` as top-level fields. These are replaced with a per-node artifact map:

```typescript
export type NodeArtifact = {
  type: ArtifactType;
  content: string;
  verificationStatus: NodeVerificationStatus;
  verificationErrors: string;
};

export type PropositionNode = {
  id: string;
  label: string;
  kind: PropositionKind;
  statement: string;
  proofText: string;
  dependsOn: string[];
  sourceId: string;
  sourceLabel: string;
  context: string;               // new: per-node context (empty = inherit global)
  selectedArtifactTypes: ArtifactType[];  // new: which chips are selected for this node
  artifacts: NodeArtifact[];     // replaces semiformalProof, leanCode, etc.
};
```

This resolves 002's open question about per-node context storage and per-node chip selection state. Both are properties of the node, persisted with the decomposition state.

### 9. The Deductive Pipeline Remains Two Steps

The "Deductive (Lean)" chip in the UI selects the deductive *dimension*, but the pipeline remains two steps: generate semiformal, then (on user action) generate Lean. Selecting the chip generates the semiformal output. The user reviews and edits the semiformal, then explicitly triggers Lean generation from the Semiformal panel.

This preserves the existing review-then-verify workflow. The chip label should make this clear — e.g., "Deductive (Lean)" generates the semiformal first, and the Semiformal panel's "Generate Lean4 Code" button remains the entry point for the second step.

The other four artifact types are single-step: chip selection + "Formalise" produces the final artifact directly.

## Options Considered

### Single `/formalization/generate` endpoint with artifact type parameter

A single route that switches on `artifactType` in the request body. Rejected because: (a) response shapes differ per type, making the return type a discriminated union that complicates frontend type narrowing, (b) system prompts and post-processing are completely different per type, (c) it breaks the existing pattern where each route is self-contained.

### Intermediate representation for all artifact types

Generate a "semiformal" version of each artifact type before the structured output — e.g., a prose causal analysis before the causal graph JSON. Rejected because: (a) the semiformal step exists for the deductive pipeline because Lean generation benefits from structured mathematical prose as an intermediate; the other artifact types don't have an analogous "hard to generate directly" problem, (b) it doubles LLM costs for no clear quality gain, (c) it adds user-facing complexity (review two outputs per artifact type).

### Unified artifact storage as a single JSON blob

Store all artifacts for a session as a single `Record<ArtifactType, string>` instead of an array. Considered but rejected in favor of an array because: (a) arrays naturally support multiple versions/runs of the same artifact type, (b) each artifact entry carries its own verification state, (c) the array is easier to extend with metadata (timestamps, run numbers) without changing the shape.

### Verification in the same LLM call as generation

Include verification prompts in the generation system prompt so the LLM self-checks. Rejected because: (a) self-verification is less reliable than a separate critical pass, (b) it increases generation latency, (c) it prevents the user from editing the artifact before verification.

## Consequences

**Makes easier:**
- Frontend can fire parallel requests — each chip maps to one fetch call
- Partial failure is natural — each artifact has independent success/error state
- Session and node models cleanly track multiple artifact types
- Verification can be added incrementally per artifact type without changing the generation routes
- Per-node context and artifact selection are first-class data model concepts

**Makes harder:**
- Six route handlers to maintain instead of two (though each is simple and follows the same pattern)
- `FormalizationSession` migration needed for existing localStorage data
- `PropositionNode` shape change requires updates to all components that read node fields (`NodeDetailPanel`, `GraphPanel`, `useAutoFormalizeQueue`, `useDecomposition`)
- Frontend needs per-artifact-type loading state management (addressed in 002's frontend prerequisites)

**Resolves these open questions from 002:**
- Parallel vs. sequential generation: **parallel**, no dependencies between artifact types
  - Though the LiteLLM caller interface should avoid hitting rate limits on LLM backends
- Partial failure handling: **per-artifact error state**, independent success/failure
- Session model extension: **`artifacts` array** replaces top-level deductive fields
- Per-node context storage: **`context` field on `PropositionNode`**
- Per-node chip state: **`selectedArtifactTypes` field on `PropositionNode`**
- Deductive (Lean) two-step question: **semiformal first, Lean on explicit user action**
