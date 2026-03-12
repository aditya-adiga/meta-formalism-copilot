# 001: Formal Artifact Types Beyond Lean Proofs

**Date:** 2026-03-06

**Status:** Accepted

**Context:** The Metaformalism Copilot currently produces two artifact types from user input: semiformal proofs (structured mathematical prose) and Lean4 code (machine-verified deductive proofs). Many insights and arguments that users want to formalize are not well-served by Lean — they may be causal, statistical, perspectival, or constructive in nature. The tool needs additional formalization modes to fulfill its "generalization via inclusion" philosophy.

## Decision

Expand the formalization pipeline to support four new artifact types alongside the existing semiformal + Lean path. Each represents a distinct dimension of rigor:

### 1. Causal Graph

**What it is:** A directed graph of variables and causal relationships with directional edges and relationship weights. Captures "what causes what and how strongly."

**Verification:** Consistency checks — are probability constraints compatible? Are relevant confounders included? Do relationship weights match stated intuitions? Are resulting probabilities mutually compatible?

**Best for:** Arguments about mechanisms, interventions, system dynamics. Useful for forecasting probabilities of complex future events, identifying cruxes of disagreement.

### 2. Statistical Model

**What it is:** Explicit probability distributions over variables, controlled/uncontrolled confounders, variance decomposition, and significance requirements. Turns vague claims about correlation into auditable statistical specifications.

**Verification:** Internal consistency of stated probabilities, identification of uncontrolled demographic variables, named levels of variance, checks that appropriate controls are weighted or statistically significant.

**Best for:** Empirical claims, hypotheses about correlations (e.g., psychology survey results), policy arguments that rest on data patterns.

### 3. Property Test Suite

**What it is:** A set of executable property-based tests that specify what must hold if the argument is correct. Captures the constructive/algorithmic content as machine-runnable specifications rather than implementations.

**Verification:** Run the tests. Failures indicate where the argument's implications don't hold empirically.

**Why tests, not programs:** The tool's role is to produce *specifications* that are useful inputs to downstream tools (code-writing assistants, implementation teams). Functional code generation is already well-served by existing tools; what's actually blocked is translating informal reasoning into precise, testable requirements. Property tests are readable, focused on guarantees, and serve as ideal input for code generation.

**Best for:** Arguments with constructive content — "it's possible to build X satisfying Y" — where the claim can be checked against concrete examples. Planning requirements before developing software.

### 4. Balanced Perspectives

**What it is:** A structured decomposition of an argument into multiple coherent perspectives (strains of argument), each articulated in its own direction, followed by a synthesis that identifies an equilibrium between those perspectives.

**Verification:** Coverage checks — does the synthesis actually address each perspective's core concern? Are the perspectives genuinely distinct rather than strawmen? This is the least machine-verifiable of the four but can be checked structurally.

**Best for:** Contested topics, value-laden arguments, design decisions with genuine tradeoffs, any situation where "the truth" requires holding multiple frames simultaneously.

## Design Principles

These four types plus the existing deductive (Lean) path span five dimensions of formalization:

| Dimension | Artifact | Core question |
|-----------|----------|--------------|
| Deductive | Lean4 proof | "Is it logically necessary?" |
| Causal | Causal graph | "What causes what?" |
| Statistical | Statistical model | "What does the data say?" |
| Constructive | Property test suite | "What must hold if you build it?" |
| Perspectival | Perspectival map | "What are the tensions and how do they resolve?" |

Each artifact type should:
- Be generatable from the same source material the tool already ingests
- Be editable/refinable using the inline and whole-text edit patterns
- Have some form of automated or structural verification
- Represent a genuinely different dimension of formalization (not a variation on the same theme)
- Be useful to researchers who are not necessarily mathematicians

## Options Considered

A divergent design process generated 15 candidate artifact types. After matching against constraints (LLM-producible, panel-friendly, editable, useful without Lean, aids thinking), five were discarded for being too similar to existing artifacts (literate docs, multi-prover), too niche (TLA+/Alloy), or not addressing the problem (do nothing). The remaining candidates were consolidated around the four dimensions above, informed by both AI-generated options and the project maintainer's use cases.

Notable alternatives that were folded into the final four:
- **Argument maps (Toulmin structure)** — absorbed into Causal Graph and Balanced Perspectives
- **Bayesian/probabilistic models** — absorbed into Causal Graph (weights) and Statistical Model (distributions)
- **Critique scaffolds** — absorbed into Balanced Perspectives (the adversarial perspective becomes one strand of the balanced perspective analysis)
- **Executable algorithms** — reframed as Property Test Suites (specifications over implementations)
- **Diagrams-as-code** — a presentation concern applicable to multiple artifact types, not a distinct formalization dimension

## Consequences

**Makes easier:**
- Formalizing non-mathematical arguments (causal, empirical, perspectival)
- Getting value from the tool even when Lean verification is infeasible
- Producing multiple complementary representations of the same idea
- Generating precise specifications useful as input to other tools

**Makes harder:**
- UI complexity increases — need to manage multiple artifact types per source
- Each artifact type needs its own generation prompts, edit prompts, and verification strategy
- The "what should I formalize this as?" decision becomes a user-facing choice
- Testing and quality assurance surface area grows significantly
