# 004: Generalized Decomposition Node Types

**Date:** 2026-03-06

**Status:** Accepted

**Context:** The decomposition API (`/api/decomposition/extract`) only extracts formal mathematical propositions (definitions, lemmas, theorems, etc.). When given non-mathematical input — persuasive essays, conversations, mixed-mode documents — the LLM correctly finds zero formal propositions and returns an empty array. This makes the "Decompose into nodes" feature useless for the majority of inputs.

The LaTeX and PDF fast paths handle structured math papers deterministically before the LLM is called. The LLM decomposition prompt therefore only needs to handle "everything else" — informal arguments, essays, conversations, research notes, mixed content.

**Companion context:** The Live Conversational Threads project supports many modalities for separating threads of reasoning. Decomposition should reflect this breadth.

## Decision

### Generalize `PropositionKind` into `NodeKind`

Replace the math-only taxonomy with a broader set of node kinds that cover multiple input modalities:

```typescript
export type NodeKind =
  // Mathematical (preserved for TeX/PDF fast-path compatibility)
  | "definition"
  | "lemma"
  | "theorem"
  | "proposition"
  | "corollary"
  | "axiom"
  // Argumentative
  | "claim"
  | "evidence"
  | "assumption"
  | "objection"
  | "rebuttal"
  // Structural
  | "question"
  | "observation"
  | "narrative"
  | "methodology"
  | "conclusion";
```

### Broaden the LLM decomposition prompt

Replace the math-specific system prompt with one that extracts meaningful structural units from any input type. The prompt should:

- Identify the dominant mode of the input (mathematical, argumentative, empirical, narrative, mixed)
- Extract nodes using appropriate kinds for that mode
- Preserve dependency extraction (what references/uses what)
- Keep the same JSON output schema (id, label, kind, statement, proofText, dependsOn, sourceId)

### Artifact-type affinity

The richer taxonomy enables downstream hints about which artifact types suit each node:

| Node kinds | Natural artifact affinity |
|------------|--------------------------|
| definition, lemma, theorem, proposition, corollary, axiom | Deductive (Lean) |
| claim, evidence, assumption | Balanced Perspectives, Property Tests |
| claim + evidence with causal language | Causal Graph |
| methodology, observation with quantitative content | Statistical Model |

This affinity is informational for now (not enforced), but positions the system for auto-suggesting artifact types per node in the future (noted in 002's Future Considerations).

## Options Considered

1. **Minimal fix** — Loosen the existing prompt to fall back to "claims and arguments" when no formal propositions found. Low effort but labels still feel math-flavored; no artifact affinity.
2. **Generalized node types** (chosen) — Richer taxonomy + broad prompt. Moderate effort, covers all input types naturally, positions for artifact-type suggestions.
3. **Auto-detect + route to specialized prompts** — Classify input type first, then use a type-specific prompt. Best per-type quality but higher effort and maintenance burden (multiple prompts). Can be layered on top of this decision later if the single broad prompt proves insufficient.
4. **User selects decomposition mode** — Explicit mode selector UI. Rejected because it requires users to classify their own input, adding friction.

## Consequences

**Makes easier:**
- Decomposing essays, conversations, and mixed-mode documents
- Future auto-suggestion of artifact types based on node kind
- Supporting the LCT vision of multi-modal thread separation

**Makes harder:**
- `PropositionKind` rename to `NodeKind` touches type definitions, GraphPanel, NodeDetailPanel, ProofGraphNode, and persistence/export code
- The broad prompt may be less precise than specialized math extraction — but this is acceptable since math papers are handled by the TeX/PDF fast paths before the LLM is called

**Future extension:** If the single broad prompt proves imprecise for certain input types, auto-detection routing (#3) can be added as a layer on top without schema changes — the generalized node types are a prerequisite for that anyway.
