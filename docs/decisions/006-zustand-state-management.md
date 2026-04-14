# 006: Zustand for State Management

## Context

The app's state management outgrew its `useState` sprawl in `page.tsx` (~20+ variables). Symptoms: ref-based accessor hacks to avoid stale closures, manual debounced localStorage persistence, no artifact edit history, no undo/redo. Upcoming features (graph editing, provenance tracking, import/export) would worsen the complexity.

## Options Considered

12 candidate architectures evaluated via divergent design:
- **Do nothing / minimal patches** — cheapest but worsens sprawl
- **Artifact Store (custom)** — additive layer, no deps, but creates two sources of truth
- **Zustand** — well-known library, already a transitive dep via ReactFlow
- **Event-sourced / CRDT / SQLite** — powerful but poor incremental adoption
- **useReducer / Context providers** — partial solutions, don't address core problems

## Decision

**Zustand v5 with artifact versioning layer.** Validated via spike (20 tests, all passing).

## Rationale

- `persist` middleware replaces manual debounce/localStorage/`buildSaveInput` pattern
- `getState()` eliminates stale-closure ref hacks in `PipelineAccessors`
- Artifact versioning (undo/redo) is a natural fit as store state
- `skipHydration: true` + `rehydrate()` handles Next.js SSR
- ReactFlow already bundles zustand@4 — adding v5 is barely a new dependency
- Well-documented library reduces bus-factor risk vs custom abstractions

## Consequences

**Easier:**
- Adding new state fields (just add to store, no useState/useCallback boilerplate)
- Edit history / undo / redo
- Snapshot/restore for sessions
- Eliminating stale closures in async callbacks

**Harder:**
- Streaming previews must stay outside persisted store (persist writes on every set())
- Every component reading state via props must be migrated to selectors (incremental)
- New dependency to understand (though well-known in React ecosystem)
