# 002: Multi-Artifact UI Layout

**Date:** 2026-03-06

**Status:** Accepted

**Context:** Decision [001](001-formal-artifact-types.md) introduced four new artifact types (Causal Graph, Statistical Model, Property Test Suite, Balanced Perspectives) alongside the existing Semiformal + Lean path. The current UI is structured around a single formalization pipeline: source input → context → "Formalise" → semiformal proof → Lean code. The workspace needs to accommodate multiple artifact types without overwhelming the user or breaking the existing flow.

**Companion decision:** [003](003-artifact-generation-api.md) defines the backend API contracts, session model changes, and data model evolution that support this UI design. Questions about request/response shapes, parallel generation, per-node context storage, and the deductive two-step pipeline are resolved there.

The current layout is a single-panel-at-a-time model: an `IconRail` on the left selects which `FocusPane` is visible. Panels today are Source Input, Proof Graph, Node Detail, Semiformal Proof, Lean4 Code, and LLM Usage.

## Decision

### 1. Artifact Type Selector (chip/pill toggle row)

Replace the single "Formalise" button with an **artifact type selector** — a row of toggleable chips above the generate button. The user selects which artifact type(s) to produce, then clicks one button to generate all selected types.

The chips are:

```
[Deductive (Lean)] [Causal Graph] [Statistical Model] [Property Tests] [Balanced Perspectives]
```

Multiple chips can be active simultaneously. "Deductive (Lean)" is the existing semiformal-then-Lean pipeline, presented as one of five peer options rather than the default.

**Why chips over a dropdown:** Chips make the full set of options visible at a glance. This is critical for discoverability — users who don't know about causal graphs or balanced perspectives will see them as options and can learn what they are. A dropdown hides these behind an extra click.

The chip selector appears in two places:
- **InputPanel** — for "formalise directly" (whole-source) generation
- **NodeDetailPanel** — for per-node generation after decomposition

### 2. Decomposition Moves to the Input Panel, Before Context

The current flow puts decomposition on a separate Graph panel, accessible only after navigating away from input. The revised flow makes decomposition a **first-class action on the Input panel**, presented as a peer choice to direct formalization:

```
Source Input
  ↓
Choose path:
  ├─ "Decompose into nodes" → Decomposition panel → select node → per-node context + artifacts → Generate
  └─ "Formalise directly"   → context + artifact chips → Generate
```

**Why decompose before context:** Different nodes from a decomposed input may be amenable to different formalization types. A conversation might contain a causal argument, an empirical claim, and a philosophical tension — each needing different artifact types and different context framing. If context is set globally before decomposition, the user loses the ability to tailor per-node. By decomposing first, each node gets its own context and artifact selection.

The Input panel layout becomes three sections:

1. **Source Inputs** — text area + file upload (unchanged)
2. **Action Choice** — "Decompose into nodes" button, with a visual separator, then the direct-formalization path: artifact chips → context textarea → refinement buttons → "Formalise" button
3. The "Formalise" button label updates to reflect selection (e.g., "Formalise → 2 artifacts")

### 3. Per-Node Context and Artifact Selection

When a user selects a node from the decomposition graph, the **NodeDetailPanel** shows:

- Node statement and dependencies (existing)
- **Artifact type chips** (same component as InputPanel)
- **Per-node context textarea** — defaults to showing the global context as greyed placeholder text, but allows override. Context becomes a property of each formalization request, not only a global setting.
- "Formalise" button to generate for that node

This means the shared artifact-chip-selector component is reused in both InputPanel and NodeDetailPanel.

### 4. Progressive Disclosure via Hidden Panels

All output panels (including the existing Semiformal and Lean panels) are **hidden until they have content**. This follows the existing `node-detail` pattern where `hidden: true` keeps the panel out of the IconRail.

On first visit, the user sees only:
- **Source Input** (always visible)
- **LLM Usage** (always visible)

As the user generates artifacts, panels appear in the rail. This prevents a cluttered rail with 10+ entries on first load.

### 5. IconRail Grouping

The rail gains a visual section separator between input/navigation panels and artifact output panels:

```
[Source Input]            ← always visible
[Decomposition]           ← hidden until decomposed
[Node Detail]             ← hidden unless node selected
─── Artifacts ───         ← separator, visible when any artifact exists
[Semiformal Proof]        ← hidden until generated
[Lean4 Code]              ← hidden until generated
[Causal Graph]            ← hidden until generated
[Statistical Model]       ← hidden until generated
[Property Tests]          ← hidden until generated
[Balanced Perspectives]         ← hidden until generated
─── ───
[LLM Usage]               ← always visible
```

The separator helps the user understand the rail's structure without needing labels when collapsed (icon-only mode).

### 6. Rename "Proof Graph" to "Decomposition"

The graph is no longer only about proofs — it decomposes any input into independently formalizable nodes. Renaming to "Decomposition" (panel ID `"decomposition"`) reflects this broader purpose.

## Panel ID Changes

```typescript
export type PanelId =
  | "source"
  | "decomposition"      // renamed from "graph"
  | "node-detail"
  | "semiformal"
  | "lean"
  | "causal-graph"       // new
  | "statistical-model"  // new
  | "property-tests"     // new
  | "perspective-balance"    // new
  | "analytics";
```

## Options Considered

### Artifact selector: Dropdown on the Formalise button
A split-button with a dropdown arrow listing artifact types. Rejected because it hides options behind an extra click, reducing discoverability of the new artifact types — the primary motivation for this UI change.

### Decomposition after context
Keep context as a global-only step that precedes decomposition (current behavior). Rejected because different nodes from the same source may need fundamentally different context framing and artifact types. A causal claim and a philosophical argument in the same input should not be forced into the same context.

### Separate panel per artifact type with no grouping
Show all 10 panels in the rail at all times. Rejected for overwhelming new users and cluttering the rail. Progressive disclosure (hidden until populated) plus section separators gives structure without clutter.

### Tab bar within a single "Artifacts" panel
Instead of separate panels, show one "Artifacts" panel with tabs for each generated artifact type. Considered but rejected because: (a) it breaks the existing one-panel-one-purpose pattern, (b) the editing UIs for each artifact type are substantially different (graph editor vs. code display vs. structured text), and (c) it would make the panel component very complex.

## Frontend-Only Prerequisites

These concerns are independent of the backend API design (see [003](003-artifact-generation-api.md)) and should be addressed during or before implementation:

**InputPanel decomposition:** The InputPanel gains a third section (action choice) on top of its existing source inputs and context sections. Before adding the artifact chip selector and decomposition fork, extract the context + refinement + formalise section into its own component (`FormalizationControls` or similar) so InputPanel remains a composition of focused subcomponents rather than a monolith.

**page.tsx orchestration complexity:** All panel wiring, state management, and callback definitions live in `page.tsx` (709 lines for 6 panels). Adding 4 more panels will push this past maintainability. Options: extract per-panel logic into custom hooks (e.g., `useCausalGraphPanel`), introduce a lightweight context for artifact state, or split `page.tsx` into a shell that composes panel-specific modules. The specific approach can be chosen during implementation, but the need for it should be anticipated.

**Panel ID rename migration:** Renaming `"graph"` to `"decomposition"` may break existing localStorage data for users who have persisted workspace state. Add a one-time migration in `useWorkspacePersistence` that maps old panel IDs to new ones on load.

## Future Considerations

**Auto-suggesting artifact types:** The tool could use the LLM to suggest which artifact types fit each node (e.g., tagging a node as "causal?" or "statistical?"). This reduces the "which should I pick?" decision burden noted in 001's consequences. Not required for the initial implementation but a natural extension.

**Cross-artifact navigation banner:** The SessionBanner (visible on output panels) could show chips indicating which artifact types exist for the current source/node, allowing quick cross-artifact navigation without returning to the rail. Deferred to implementation phase.

## Consequences

**Makes easier:**
- Discovering and selecting from all five formalization dimensions
- Generating multiple artifact types from the same input in one action
- Tailoring context and artifact selection per decomposed node
- Onboarding — the rail starts minimal and grows as the user works

**Makes harder:**
- InputPanel becomes more complex (three sections instead of two)
- Shared artifact-chip-selector component must be extracted and reused
- Panel count grows from 6 to 10, requiring the hidden/separator pattern to manage complexity
- Each new artifact panel needs its own stub component before backend integration
