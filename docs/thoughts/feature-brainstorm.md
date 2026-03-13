# Feature Brainstorm: Metaformalism Copilot

_Generated via divergent design process. Date: 2026-02-28._

## Current State Summary

The tool currently supports: paste/upload source text, describe context, AI-generated semiformal proof, AI-generated Lean4 code, external Lean verification, paper decomposition into a proof graph (DAG of propositions), per-node formalization with dependency-aware Lean generation, inline/whole-text AI editing of semiformal output, context refinement (elaborate/shorten/formalize/clarify), and full workspace export (zip of .md + .lean + graph PNG).

**Known gaps in current implementation:**
- Context text is captured but never actually sent to the semiformal generation API
- Lean verifier is external and silently mocks success when unavailable
- No user accounts, collaboration, or server-side persistence
- No undo/history for any AI operations
- No streaming — all LLM responses arrive as complete blocks
- Legacy dead code (InputPanel, OutputPanel, BookSpineDivider) still present

---

## Phase 1: Diverge (15 candidate features/workflows)

1. **Multi-context formalization** — Generate multiple semiformal proofs from the same source, each with a different context (e.g., "for a category theorist," "for an undergraduate," "for a computer scientist"). Compare side by side.

2. **Conversation thread per node** — Attach a chat thread to each proposition node. The user can discuss, ask questions, or give natural-language instructions that refine that node's formalization iteratively.

3. **Actually use context in formalization** — Wire `contextText` into the `/api/formalization/semiformal` prompt so the context panel actually influences output. (This is a bug fix but changes the product significantly.)

4. **Streaming LLM responses** — Stream semiformal and Lean generation token-by-token so the user sees progress and can cancel early.

5. **Version history / undo stack** — Track every AI-generated and manual edit as a version. Allow diffing between versions and rolling back.

6. **Do nothing / polish existing** — Clean up dead code, improve error messages, add loading skeletons, and make the existing flow more reliable without new features.

7. **Multi-formalism output** — Instead of semiformal+Lean, support multiple output formats: Coq, Agda, Isabelle, plain LaTeX, or even pseudocode. Each formalism gets its own panel or tab.

8. **Import from arXiv / DOI** — Paste an arXiv ID or DOI and automatically fetch + extract the paper text, pre-populating the source panel.

9. **Collaborative workspaces** — Server-side persistence with shareable links. Multiple users can view/edit the same workspace simultaneously (or asynchronously).

10. **Guided onboarding walkthrough** — A first-run tutorial that walks a new user through: paste text, set context, formalize, decompose, verify. Highlights what each panel does.

11. **Proof strategy suggestions** — Before generating Lean, present the user with 2-3 high-level proof strategies (e.g., "by induction on n," "by contradiction," "direct construction") and let them pick or modify one.

12. **Natural language query over the proof graph** — A search/question bar where the user can ask "which nodes depend on Lemma 2?" or "what's the weakest assumption used?" and get highlighted subgraphs.

13. **Lean library / tactic explorer** — When Lean verification fails, show relevant Mathlib lemmas or tactics that might fix the issue, with one-click insertion.

14. **Export to LessWrong / blog post** — One-click export that formats the semiformal proof, graph visualization, and Lean code into a publishable blog post or LessWrong draft.

15. **Annotation layer** — Let users highlight spans of the source text and tag them (claim, assumption, definition, example, aside). These annotations seed the decomposition rather than relying entirely on the LLM to identify propositions.

---

## Phase 2: Diagnose (Problems and Constraints)

### Hard Constraints (must satisfy)

- **H1: Solo developer bandwidth** — One developer (you) building and maintaining this. Features must be implementable in days, not weeks. No ops-heavy infrastructure.
- **H2: Research context** — This is part of the AISC/LCT research program. Features should be demoable and produce artifacts that advance the research narrative (Live Theory / generalization via inclusion).
- **H3: Existing architecture** — Next.js client-heavy SPA with localStorage persistence. No database, no auth, no server state. Adding those is a large lift.
- **H4: External Lean verifier dependency** — Lean verification requires the external service. Features that make verification more critical also make the external dependency more critical.
- **H5: LLM cost and latency** — Each formalization call hits Claude/OpenRouter. Features that multiply LLM calls multiply cost and wait time.

### Soft Constraints (prefer to satisfy)

- **S1: Demoability** — Can the feature be shown in a 5-minute demo to a collaborator or at a research meeting?
- **S2: Novelty** — Does this exist in other tools (Lean web IDEs, proof assistants, Overleaf)? If so, is our version meaningfully different?
- **S3: Builds on existing work** — Does it extend what's already built rather than requiring a new subsystem?
- **S4: Useful without Lean verifier** — Can the feature be used/demoed even when the external verifier is down?
- **S5: User feedback opportunity** — Does the feature create a natural point where a user can give feedback that improves the research?
- **S6: Supports "Live Theory" philosophy** — Does it embody "generalization via inclusion" (multiple rigorous representations tailored to contexts)?

---

## Phase 3: Match and Prune

| #  | Feature                         | H1 Solo | H2 Research | H3 Architecture | H4 Verifier | H5 Cost | S1 Demo | S2 Novel | S3 Extends | S4 No-verify | S5 Feedback | S6 Live Theory |
|----|--------------------------------|---------|-------------|-----------------|-------------|---------|---------|----------|------------|-------------|-------------|----------------|
| 1  | Multi-context formalization     | ~       | ✓           | ✓               | ~           | ⚠       | ✓       | ✓        | ✓          | ✓           | ✓           | ✓              |
| 2  | Conversation thread per node    | ~       | ✓           | ✓               | ✓           | ~       | ✓       | ~        | ✓          | ✓           | ✓           | ~              |
| 3  | Actually use context            | ✓       | ✓           | ✓               | ✓           | ✓       | ✓       | ✓        | ✓          | ✓           | ~           | ✓              |
| 4  | Streaming responses             | ✓       | ~           | ✓               | ✓           | ✓       | ✓       | ✗        | ✓          | ✓           | ✗           | ✗              |
| 5  | Version history / undo          | ~       | ~           | ✓               | ✓           | ✓       | ~       | ✗        | ✓          | ✓           | ✗           | ~              |
| 6  | Do nothing / polish             | ✓       | ~           | ✓               | ✓           | ✓       | ~       | ✗        | ✓          | ✓           | ✗           | ✗              |
| 7  | Multi-formalism output          | ✗       | ✓           | ~               | ✗           | ⚠       | ✓       | ✓        | ~          | ✓           | ~           | ✓              |
| 8  | Import from arXiv / DOI         | ✓       | ✓           | ✓               | ✓           | ✓       | ✓       | ~        | ✓          | ✓           | ✗           | ✗              |
| 9  | Collaborative workspaces        | ✗       | ~           | ✗               | ✓           | ✓       | ✓       | ✗        | ✗          | ✓           | ✓           | ~              |
| 10 | Guided onboarding               | ✓       | ✓           | ✓               | ✓           | ✓       | ✓       | ✗        | ✓          | ✓           | ✓           | ✗              |
| 11 | Proof strategy suggestions      | ~       | ✓           | ✓               | ~           | ~       | ✓       | ✓        | ✓          | ✓           | ✓           | ✓              |
| 12 | NL query over proof graph       | ~       | ✓           | ✓               | ✓           | ~       | ✓       | ✓        | ✓          | ✓           | ~           | ~              |
| 13 | Lean tactic explorer            | ~       | ~           | ✓               | ⚠           | ~       | ~       | ~        | ✓          | ✗           | ✗           | ✗              |
| 14 | Export to LessWrong             | ✓       | ✓           | ✓               | ✓           | ✓       | ✓       | ✓        | ✓          | ✓           | ✗           | ~              |
| 15 | Annotation layer                | ~       | ✓           | ✓               | ✓           | ✓       | ✓       | ✓        | ✓          | ✓           | ✓           | ✓              |

**Eliminated:**
- **#7 Multi-formalism output** — ✗ on H1 (huge effort to add Coq/Agda/Isabelle pipelines) and ⚠ on H5
- **#9 Collaborative workspaces** — ✗ on H1 and H3 (requires database, auth, real-time sync)
- **#13 Lean tactic explorer** — ⚠ on H4 (deepens verifier dependency), weak across soft constraints

---

## Phase 4: Survivors — Grouped by Theme

### Tier A: High impact, low-to-moderate effort, strong research alignment

| # | Feature | Effort | Key Strength | Key Risk |
|---|---------|--------|-------------|----------|
| 3 | Actually use context in formalization | Hours | Fixes a real bug; makes the context panel meaningful; directly embodies "tailored to context" | None — this is straightforward |
| 1 | Multi-context formalization | 2-3 days | Strongest "Live Theory" demo; shows generalization via inclusion in action | LLM cost scales linearly with contexts; UI for comparison needs design |
| 15 | Annotation layer | 2-3 days | Gives users agency over decomposition; creates feedback loop | Interaction design for highlight + tag needs thought |
| 11 | Proof strategy suggestions | 1-2 days | Makes the "black box" formalization more transparent; user steers direction | Prompt engineering for generating meaningful strategies |

### Tier B: Useful polish and workflow improvements

| # | Feature | Effort | Key Strength | Key Risk |
|---|---------|--------|-------------|----------|
| 4 | Streaming responses | 1-2 days | Better UX; reduces perceived latency | No research value; standard engineering |
| 10 | Guided onboarding | 1 day | Enables user testing; makes demos self-service | Low novelty; maintenance burden as UI changes |
| 14 | Export to LessWrong | 1 day | Natural publishing workflow for research output | Formatting fiddly; LessWrong API may be undocumented |
| 8 | arXiv import | 1 day | Reduces friction for the primary use case (formalizing papers) | PDF extraction quality varies; arXiv API rate limits |

### Tier C: Interesting but heavier investment

| # | Feature | Effort | Key Strength | Key Risk |
|---|---------|--------|-------------|----------|
| 2 | Conversation thread per node | 3-5 days | Deep iterative refinement; captures reasoning trace | UI complexity; context window management for long threads |
| 5 | Version history | 3-5 days | Safety net for AI edits; enables experimentation | Storage and diff UI; scope creep |
| 12 | NL query over proof graph | 2-3 days | Novel interaction with structured proof data | Accuracy of graph queries; prompt engineering |
| 6 | Polish existing | 1-2 days | Reduces bugs and rough edges | No demo impact; no research story |

---

## Open Questions for User Research

_These inform which features to build. See `user-research-setups.md` for structured ways to answer them._

- **Q1:** When users set context, what do they actually write? Is it audience ("for a category theorist") or domain constraints ("using ZFC only") or something else?
- **Q2:** Do users want to steer formalization (choose strategies, annotate source) or do they prefer a "push button, get proof" flow?
- **Q3:** How do users react when verification fails? Do they try to fix it manually, or do they want the AI to keep trying?
- **Q4:** Is the proof graph useful as-is, or do users want to restructure/edit the decomposition?
- **Q5:** What do users do with the output? Copy-paste into a paper? Share a link? Push to a Lean project?
- **Q6:** How many "contexts" would a user realistically want for the same source? 2? 5? Is comparison valuable?
