# Feature Proposals — February 2026

These are value proposals for features identified through a divergent design exercise. They describe *what* and *why*, not *how*. Implementation planning is separate.

---

## 1. State Persistence — **Implemented** (PR [#21](https://github.com/aditya-adiga/meta-formalism-copilot/pull/21))

### The problem

Every page refresh destroys all work. Source text, uploaded file extractions, context descriptions, semiformal proofs, Lean code, decomposition graphs — all gone. This means:

- Users can't close their browser and come back
- An accidental refresh (or a dev server restart during development) loses potentially hours of iterative refinement
- Users can't experiment freely because the cost of losing state is high — this creates a conservatism that runs counter to the tool's philosophy of iterative exploration
- Demo sessions are fragile: you can't prepare a half-finished state to show someone

### Why it matters for the project

The formalization pipeline is inherently multi-session work. A user uploads a paper, writes careful context, iterates on the semiformal proof, fixes Lean errors — this isn't a single sitting. Without persistence, the tool can only support short, self-contained experiments. That's a fundamental mismatch with how formalization actually works.

State persistence is also a prerequisite for other features. Session management, undo/redo, and "resume where I left off" all depend on the app being able to serialize and restore its state. Building this first de-risks everything that comes after.

### What it enables

- **Continuity**: Close the tab, reopen it tomorrow, pick up where you left off
- **Confidence to experiment**: Try a different context framing without fear of losing the current one
- **Development velocity**: No more re-entering test data after every dev server restart
- **Foundation for session management**: Once state can be saved, naming and switching between saved sessions becomes straightforward

### Scope and boundaries

The core proposal is localStorage-based auto-save/restore of the full workspace state. This intentionally does *not* include:
- Cloud sync or multi-device support
- Named sessions or project switching (that's a separate, larger feature)
- Undo/redo history (orthogonal)

It's the smallest useful version: your work survives a page refresh.

### Implementation notes

Implemented on branch `feat/workspace-persistence`. All workspace state is auto-saved to `localStorage` under a single versioned key (`workspace-v1`) with a 500ms trailing debounce. Transient statuses are sanitized on save (`"verifying"` → `"none"`, `"in-progress"` → `"unverified"`). Schema version field supports future migrations. Hydration-safe (SSR-compatible). 25 new tests covering pure serialization functions and the persistence hook.

---

## 2. Lean Error Explanation — **Implemented**

### The problem

When Lean verification fails, the user sees raw `lake build` output. This is useful to someone fluent in Lean 4, but the whole point of this tool is to support formalization for people who may *not* be Lean experts. A typical error looks like:

```
Verify.lean:12:4: error: type mismatch
  rfl
has type
  ?m.1234 = ?m.1234
but is expected to have type
  x + y = y + x
```

For someone working at the "insight → formalism" level, this is opaque. They know their proof idea is right but can't diagnose whether the issue is a typo, a missing import, a wrong tactic, or a genuine logical gap. So they either give up or blindly click "Iterate" and hope the LLM fixes it — neither of which is the active, discerning engagement the tool is designed to support.

### Why it matters for the project

The formalization pipeline has a critical gap between "verification failed" and "here's what to do about it." The tool already has an "Iterate" button that sends the error back to the LLM for a fix attempt, but this is a black box — the user doesn't learn *why* it failed or *what* the fix addresses. This undermines the "bidirectional approach" philosophy: the user should understand the formalization, not just approve LLM output.

Error explanation closes the loop. It transforms opaque compiler output into actionable understanding: "The proof used `rfl` (reflexivity) but needs commutativity of addition — try `Nat.add_comm` or the `omega` tactic." Now the user can make an informed decision about whether to let the LLM iterate, manually edit, or reconsider the semiformal proof.

### What it enables

- **Learning**: Users gradually build Lean intuition through explained errors, not just fixed errors
- **Informed iteration**: Instead of blindly retrying, users can give the LLM targeted instructions ("use Nat.add_comm here")
- **Debugging semiformal proofs**: Sometimes the Lean error reveals a genuine logical gap in the semiformal proof — the explanation can surface this distinction
- **Reduced frustration**: The difference between "verification failed (wall of text)" and "verification failed — here's what went wrong in plain English" is the difference between a dead end and a next step

### Scope and boundaries

A single "Explain this error" button in the Lean panel that sends the Lean code + error output to the LLM and displays a plain-English explanation. This does *not* include:
- Automatic error explanation (user should opt in — sometimes they know Lean and just want the raw output)
- Suggested fixes in the explanation (the Iterate button already handles fix attempts; this is about *understanding*)
- Lean documentation lookup (that's closer to the literature search feature)

---

## 3. Export — **Implemented**

### The problem

The formalization pipeline produces three distinct artifacts — semiformal proof, Lean4 code, and a dependency graph — but there's no way to get them out of the app. A user who successfully formalizes an insight has no way to:

- Include the Lean code in an actual Lean project
- Share the semiformal proof in a paper or blog post
- Save a snapshot of the graph for a presentation
- Archive their work outside the browser

The tool produces valuable outputs but treats them as ephemeral.

### Why it matters for the project

Formalization is not an end in itself — it's a step in a larger research workflow. The semiformal proof might go into a paper. The Lean code might go into a library. The graph might go into a talk. If the tool can't hand off its outputs, it's a sandbox rather than a workshop.

For the AISC research context specifically, being able to export clean artifacts makes the tool demoable and the outputs citable. "Here's a .lean file this tool produced from an informal insight" is a concrete research artifact.

### What it enables

- **Integration with Lean projects**: Download `.lean` files directly into a project
- **Academic output**: Export semiformal proofs as `.tex` (with the KaTeX math already rendered to LaTeX) for inclusion in papers
- **Presentations**: Export the proof graph as an image
- **Archiving**: Save a complete snapshot of all outputs for a given formalization
- **Shareability**: Send someone a `.lean` file rather than describing what the tool produced

### Scope and boundaries

Download buttons for each output panel:
- Semiformal proof → `.tex` or `.md` (preserving LaTeX math notation)
- Lean code → `.lean`
- Proof graph → `.png` or `.svg`
- Optionally: a combined "Export All" as a `.zip`

This does *not* include:
- Import (loading a previous export back into the tool — that's session management territory)
- Publishing to external services (GitHub, arXiv)
- Lean project scaffolding (generating a full lakefile.lean + project structure)

---

## 4. Auto-Formalize Queue — **Implemented** (PR [#24](https://github.com/aditya-adiga/meta-formalism-copilot/pull/24))

### The problem

When a user decomposes a paper into a proof graph, they get a DAG of propositions — definitions, lemmas, theorems — with dependency edges. Currently, formalizing each node is a manual process: select a node in the graph, click "Formalise This Proposition," wait for the pipeline (semiformal → Lean → verify), fix errors if needed, then manually move to the next node.

For a paper with 10-15 propositions, this is tedious and error-prone. The user has to manually respect the dependency order (you can't formalize a theorem before its lemmas are verified, since the Lean code depends on them). They have to remember which nodes are done, which failed, and which are ready. The graph panel shows verification status, but the workflow of "find the next ready node and formalize it" is entirely manual.

### Why it matters for the project

The decomposition feature is arguably the most powerful part of the tool — it takes a whole paper and breaks it into a structured proof graph. But the power is undercut by the labor of walking the graph manually. The dependency-aware infrastructure already exists (the `gatherDependencyContext` utility collects verified Lean code from transitive dependencies), but there's no automation layer on top of it.

Auto-formalization turns the tool from "formalize one node at a time" into "formalize an entire paper." That's a qualitative difference in what the tool can do. It transforms the user's role from "clicking through nodes in order" to "reviewing and correcting the formalization as it proceeds" — which is exactly the active-but-not-tedious engagement the tool aims for.

### What it enables

- **Whole-paper formalization**: Click "Formalize All" and the system walks the dependency graph in topological order, formalizing each node as its dependencies are satisfied
- **Parallelism where possible**: Independent branches of the graph can be formalized concurrently
- **Graceful failure**: When a node fails verification after max retries, the system marks it as failed, skips its dependents, and continues with other branches — the user can come back to fix failures
- **Progress visibility**: The graph panel becomes a live dashboard showing formalization progress across all nodes
- **User intervention points**: The user can pause the queue, manually fix a failed node, and resume — the queue picks up from where it stopped

### Scope and boundaries

A "Formalize All" button on the graph panel that:
1. Topologically sorts the nodes
2. Processes them in dependency order (leaves first)
3. Skips nodes whose dependencies have failed
4. Updates the graph visualization in real time

This does *not* include:
- Parallel formalization of independent branches (simpler to start sequential; parallelism is an optimization)
- Automatic error recovery beyond the existing 3-attempt retry loop
- User prompts between nodes ("should I continue?" — just let it run and review after)

---

## 5. Literature Search (Exploratory)

This proposal is more open-ended than the others. Rather than a single well-defined feature, "literature search" is a cluster of related capabilities that could be built incrementally. What follows explores the design space.

### The motivating observation

Formalization doesn't happen in a vacuum. When a user pastes an insight and tries to formalize it, they're implicitly building on existing mathematical knowledge — definitions, lemmas, theorems, and frameworks that already exist in some form. The tool currently treats each formalization as a standalone exercise: the user provides source text and context, and the LLM generates a semiformal proof and Lean code from scratch.

This creates several problems:

**The LLM reinvents the wheel.** When generating Lean code, the LLM writes definitions and lemmas that may already exist in Mathlib or other libraries. The generated code is self-contained but disconnected from the ecosystem. This means it can't be composed with existing formalized mathematics, which limits its value.

**The user lacks context.** When writing the "context" description that guides formalization, the user is working from memory and intuition. They may not know that their insight has a name in a specific field, or that a closely related concept was formalized differently by someone else, or that the framework they're thinking of has known limitations documented in the literature.

**The "generalization via inclusion" philosophy is underserved.** The core idea of Live Theory is that the same abstract concept may need different formal representations in different contexts. But the tool only produces *one* formalization per run. It doesn't help the user discover *alternative* formalizations — different proof strategies, different axiomatic frameworks, different levels of abstraction — that exist in the literature. This is precisely the kind of pluralism the tool should support.

### Five distinct capabilities

Literature search could mean several things. Here are five capabilities, ordered roughly from most concrete to most ambitious:

#### 5a. Mathlib / Lean Ecosystem Search

**What**: When the Lean code references or needs a mathematical concept, search Mathlib for existing definitions, lemmas, and theorems that could be imported rather than re-derived.

**When it helps**: After Lean verification fails because a definition doesn't exist, or when the generated code includes a hand-written lemma that Mathlib already provides. Also useful during manual editing — the user selects a term and asks "does Mathlib have this?"

**Why it's distinctive**: This is the most concrete and immediately useful form of literature search. It directly improves the Lean code quality (using library lemmas instead of inline proofs) and connects the output to the broader formal mathematics ecosystem. It also pairs naturally with the Lean error explanation feature — "this failed because `Nat.add_comm` isn't in scope; it's in `Mathlib.Data.Nat.Basic`."

**Key challenge**: Mathlib is enormous (~1M lines). Effective search requires either an indexed API (Moogle, LeanSearch) or a curated subset. The LLM can't hold all of Mathlib in context.

#### 5b. arXiv / Semantic Scholar Paper Search

**What**: Given the user's source text and context, find related papers — particularly papers that formalize similar concepts or use similar frameworks.

**When it helps**: At the start of a formalization session, to ground the work in existing literature. Also useful when the user gets stuck and wants to see how others approached a similar formalization.

**Why it's distinctive**: This connects the tool to the broader research ecosystem. A user formalizing an insight about, say, category-theoretic composition could discover that the same concept appears in homotopy type theory under a different name, with an existing Lean formalization. This is "generalization via inclusion" in action — discovering that one insight maps to multiple existing formalisms.

**Key challenge**: Relevance ranking. Academic search is noisy. The tool would need to surface results that are specifically relevant to *formalization* of the user's concept, not just topically related papers.

#### 5c. Context Enrichment via Literature

**What**: When the user is writing their context description, offer to enrich it with relevant definitions, terminology, and references pulled from the literature. "You're describing something that looks like a monad — here's the standard definition and some references. Want to include this in your context?"

**When it helps**: When the user has an intuition but isn't sure of the right formal framework, or when they're working in an unfamiliar area and don't know the established vocabulary.

**Why it's distinctive**: This intervenes *before* formalization, at the context-writing stage. Better context descriptions lead to better formalizations downstream. It also serves the "active participant" philosophy — the user isn't just accepting suggestions, they're incorporating relevant literature into their own framing.

**Key challenge**: The suggestions need to be genuinely helpful, not just "here are 50 papers with the word 'topology' in them." This requires understanding what the user is *trying to formalize*, not just what words they used.

#### 5d. Alternative Formalization Discovery

**What**: After producing a formalization, show the user how the same concept has been formalized differently elsewhere. "Your insight was formalized using category theory, but there's also a formalization using order theory in [paper X] and a type-theoretic approach in [Lean library Y]."

**When it helps**: After a successful formalization, when the user wants to understand the landscape of possible formalisms for their concept. Also useful when a formalization fails — maybe a different framework would be more tractable.

**Why it's distinctive**: This is the feature most aligned with the Live Theory philosophy. It directly operationalizes "generalization via inclusion" by showing the user that their insight admits multiple valid formalizations. It turns the tool from "produce one formalism" into "explore the space of formalisms."

**Key challenge**: This requires deep semantic understanding — recognizing that two formalizations in different frameworks are "about the same thing." This is genuinely hard and may require curated examples or a specialized model.

#### 5e. Living Bibliography

**What**: As the user works through a formalization — writing context, refining semiformal proofs, fixing Lean code — the tool maintains a running bibliography of relevant references. These accumulate across the session and can be exported alongside the formalization artifacts.

**When it helps**: When the user is preparing a paper or presentation that includes the formalized result. Instead of manually tracking which papers informed the formalization, the tool does it automatically.

**Why it's distinctive**: This treats literature search not as a discrete action but as a continuous background process. It acknowledges that formalization is inherently connected to existing work and makes those connections explicit and exportable.

**Key challenge**: Noise. A background process that keeps suggesting papers could be distracting. It needs to be unobtrusive — perhaps a counter in the sidebar that accumulates references, viewable on demand.

### How these relate to each other

These five capabilities form a rough progression:

```
5a (Mathlib search) — most concrete, helps Lean code quality
     ↓
5b (Paper search) — broader scope, helps context and understanding
     ↓
5c (Context enrichment) — integrates search into the workflow
     ↓
5d (Alternative formalizations) — the philosophical payoff
     ↓
5e (Living bibliography) — continuous, ambient, exportable
```

They could be built independently, but each later capability benefits from the infrastructure of the earlier ones. 5a requires search infrastructure; 5b extends it to papers; 5c and 5d add intelligence about *when* and *how* to surface results; 5e adds continuity.

### Where to start

**5a (Mathlib search) is the most immediately useful** because it directly improves the Lean code the tool produces. It's also the most tractable — services like Moogle and LeanSearch already exist as APIs. The integration point is clear: after Lean generation or verification failure, search for relevant Mathlib lemmas and suggest imports.

**5b (paper search) is the most useful for the research mission** because it connects individual formalizations to the broader literature. Semantic Scholar has a free API with embedding-based search. The integration point is the context panel or a new "Literature" panel.

**5d (alternative formalizations) is the most philosophically aligned** but also the hardest. It could start as a manual workflow — "here are papers that formalize related concepts" — and evolve toward automatic detection of alternative frameworks.

### Open questions

- Should literature search be a separate panel, or integrated into existing panels (e.g., suggestions in the context panel, Mathlib hints in the Lean panel)?
- How aggressive should suggestions be? Always-on ambient suggestions vs. explicit "search" actions?
- What's the right balance between breadth (find everything related) and precision (find the one Mathlib lemma that fixes this error)?
- Should the tool maintain its own index of formalization-relevant papers, or rely entirely on external APIs?
