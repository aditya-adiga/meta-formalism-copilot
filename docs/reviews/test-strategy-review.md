# Test Strategy Review: feat/graph-persistence-editing vs feat/zustand-wire-page

**Date:** 2026-04-03
**Branch:** `feat/graph-persistence-editing` relative to `feat/zustand-wire-page`
**Scope:** Graph editing operations, layout persistence, ProofGraph component editing UI, useDecomposition graph-editing wiring

---

## Test Conventions

- **Framework:** Vitest with React Testing Library, jsdom environment
- **Config:** `vitest.config.ts` at repo root, setup in `vitest.setup.ts`
- **Location pattern:** Co-located test files (`Foo.test.tsx` next to `Foo.tsx`) for components and utils; `__tests__/` subdirectory for store tests
- **Naming:** `describe`/`it` blocks, descriptive test names
- **Mocking:** `vi.mock()` for module-level mocks, `vi.fn()` for individual functions
- **Helper pattern:** `makeNode()` factory function for `PropositionNode` test data (established in `graphOperations.test.ts`)
- **Run:** `npm test` (all), `npm run test:watch` (watch mode)

---

## Classification of Changes by Risk

### Critical (data integrity, core logic)

| File | What changed | Existing tests |
|------|-------------|----------------|
| `app/lib/utils/graphOperations.ts` | **New file.** Pure functions: cycle detection, add/remove node, rename, update statement, add/remove edge. All graph mutations flow through these. | `graphOperations.test.ts` -- **comprehensive coverage** (7 describe blocks, 16 tests covering all exported functions, cycle detection, edge cases) |
| `app/lib/utils/workspacePersistence.ts` | Added `coerceDecomposition` validation for `graphLayout` field (positions + viewport). Migration path for `dialecticalMap` -> `balancedPerspectives`. | **No tests for the new graphLayout coercion.** Existing `loadWorkspace` tests are in the same file pattern but don't cover layout. |
| `app/lib/types/decomposition.ts` | Added `GraphLayout` type and `graphLayout?: GraphLayout` to `DecompositionState`. | N/A (types only) |

### High (user-facing feature wiring)

| File | What changed | Existing tests |
|------|-------------|----------------|
| `app/hooks/useDecomposition.ts` | Added 7 graph editing callbacks (`addGraphNode`, `removeGraphNode`, `renameGraphNode`, `updateNodeStatement`, `addGraphEdge`, `removeGraphEdge`, `updateGraphLayout`) plus `graphLayout` in state and `resetState`. | **No tests.** |
| `app/components/features/proof-graph/useGraphLayout.ts` | Rewritten from simple Dagre-on-every-render to incremental layout with `positionsRef`, `initialPositions` seeding, position pruning, `updateNodePosition`, and `getPositions` export. | **No tests.** |
| `app/components/features/proof-graph/ProofGraph.tsx` | Added: drag persistence (`handleNodeDragStop`), viewport persistence (debounced `handleMoveEnd`), edge connect/delete handlers, context menu (delete/rename), inline rename dialog. | **No tests.** |

### Medium (peripheral changes)

| File | What changed |
|------|-------------|
| `app/lib/stores/workspaceStore.ts` | `dialecticalMap` -> `balancedPerspectives` rename in valid keys and migration map |
| `app/components/panels/GraphPanel.tsx` | Wires new editing callbacks from `useDecomposition` to `ProofGraph` |
| `app/lib/types/persistence.ts` | Minor type update |

### Low (docs, config, renames)

| File | What changed |
|------|-------------|
| Various panel components | Prop threading, UI text changes |
| `docs/*`, `CLAUDE.md`, `README.md` | Documentation updates |
| `package.json` / `package-lock.json` | Dependency updates |

---

## Recommended Tests

### 1. `coerceDecomposition` -- graphLayout validation

**Type:** Unit
**Priority:** P0 (Critical)
**File:** `app/lib/utils/workspacePersistence.test.ts` (new file, co-located)
**What it verifies:** The `coerceDecomposition` function correctly validates and coerces persisted `graphLayout` data, preventing corrupt positions from crashing the app on load.
**Key cases:**
- Valid `graphLayout` with positions `{ "node-1": { x: 100, y: 200 } }` is preserved
- Valid `graphLayout` with viewport `{ x: 0, y: 0, zoom: 1 }` is preserved
- `graphLayout` with non-numeric position values (e.g., `{ x: "bad", y: 200 }`) drops that entry
- `graphLayout` with missing `positions` key results in `undefined` graphLayout
- `graphLayout` with empty positions object (after filtering invalid entries) results in `undefined` graphLayout
- `graphLayout` with invalid viewport (missing `zoom`) omits viewport but keeps valid positions
- `graphLayout` absent entirely: `coerceDecomposition` returns `undefined` for graphLayout
- Full round-trip: `coerceDecomposition` output feeds cleanly into `resetState`
- Backward compat: `dialecticalMap` field in persisted data is read as `balancedPerspectives`
**Setup needed:** None -- pure function, import directly. Can reuse `isObject` helper already in the module.
**Effort:** Low. ~30 minutes.

---

### 2. `useGraphLayout` -- incremental positioning logic

**Type:** Unit (hook test)
**Priority:** P0 (Critical)
**File:** `app/components/features/proof-graph/useGraphLayout.test.ts` (new file)
**What it verifies:** The core layout algorithm: incremental Dagre only for new nodes, position persistence across re-renders, pruning of removed nodes.
**Key cases:**
- Empty propositions returns `{ nodes: [], edges: [] }`
- Single node gets a Dagre-computed position (not `{ x: 0, y: 0 }`)
- Two nodes with a dependency edge: nodes get positions and edge is created with correct `source`/`target`
- Adding a new node to an existing graph: existing node positions are unchanged, new node gets a Dagre position
- Removing a node: its position is pruned from the internal map
- `initialPositions` are used on first render (seeded positions match what was passed in)
- `initialPositions` are only seeded once (subsequent re-renders with different `initialPositions` are ignored)
- `updateNodePosition` updates the cached position (simulating drag)
- `getPositions` returns a plain object snapshot of all current positions
- After `updateNodePosition`, `getPositions` reflects the new position
- Clearing all propositions (empty array) resets the internal position map, so new propositions get fresh Dagre layout
**Setup needed:** `renderHook` from `@testing-library/react`. Mock `dagre` module or use it directly (it's a pure layout library, safe to use unmocked). The hook uses `useRef`, `useMemo`, `useCallback` -- all work in `renderHook`.
**Effort:** Medium. ~60 minutes (hook testing with re-render scenarios).

---

### 3. `useDecomposition` -- graph editing operations

**Type:** Unit (hook test)
**Priority:** P1 (High)
**File:** `app/hooks/useDecomposition.test.ts` (new file)
**What it verifies:** The hook correctly delegates to `graphOperations` functions, manages state transitions, and handles edge cases like deleting the selected node.
**Key cases:**
- `addGraphNode({ label: "Test" })` adds a node to `state.nodes` and returns its ID
- `removeGraphNode(id)` removes the node and cleans up `dependsOn` references
- `removeGraphNode(selectedNodeId)` also clears `selectedNodeId` to `null`
- `removeGraphNode(otherId)` preserves `selectedNodeId`
- `renameGraphNode(id, "New Label")` updates only that node's label
- `updateNodeStatement(id, "New statement")` updates only that node's statement
- `addGraphEdge(fromId, toId)` returns `true` and updates state when valid
- `addGraphEdge` returns `false` and does not modify state when cycle would be created
- `removeGraphEdge(fromId, toId)` removes the dependency
- `updateGraphLayout(layout)` stores the layout in state
- `resetState` with `graphLayout` restores layout into state
- `resetState` without `graphLayout` sets it to `undefined`
**Setup needed:** `renderHook` from `@testing-library/react`. Mock `fetchApi` via `vi.mock("@/app/lib/formalization/api")` to prevent network calls from `extractPropositions`. Use `act()` for state updates.
**Effort:** Medium. ~45 minutes. The graph operations themselves are already tested in `graphOperations.test.ts`; these tests verify the hook's state management wrapping.

---

### 4. `graphOperations` -- additional edge cases

**Type:** Unit
**Priority:** P1 (High)
**File:** `app/lib/utils/graphOperations.test.ts` (extend existing)
**What it verifies:** Edge cases not covered by the existing 16 tests.
**Key cases:**
- `addEdge` with both `fromId` and `toId` non-existent returns `null`
- `addEdge` with only `fromId` non-existent returns `null`
- `removeEdge` when the edge doesn't exist: returns nodes unchanged (no crash)
- `removeNode` on a node that other nodes depend on via multiple paths: all references cleaned
- `renameNode` with non-existent `nodeId`: returns nodes unchanged
- `updateNodeStatement` with non-existent `nodeId`: returns nodes unchanged
- `addNode` correctly copies `sourceId` and `sourceLabel` from input
- `wouldCreateCycle` on a diamond graph (A->B, A->C, B->D, C->D): adding D->A detects cycle
- Large-ish graph (10+ nodes) cycle detection terminates correctly
- Immutability: original array is not modified by any operation
**Setup needed:** None -- uses existing `makeNode` helper.
**Effort:** Low. ~30 minutes (extending existing test file).

---

### 5. ProofGraph component -- context menu and edge handling

**Type:** Integration (component test)
**Priority:** P2 (Medium)
**File:** `app/components/features/proof-graph/ProofGraph.test.tsx` (new file)
**What it verifies:** The ProofGraph component correctly wires editing callbacks and manages UI state (context menu, rename dialog).
**Key cases:**
- Rendering with editing callbacks enabled shows interactive controls
- `onConnect` callback is invoked with correct `(source, target)` when ReactFlow fires `onConnect`
- `onEdgesDelete` callback receives `[{ source, target }]` when edges are deleted
- Context menu appears on node right-click with Rename and Delete options
- Delete from context menu calls `onNodeDelete(nodeId)`
- Rename from context menu opens rename dialog; submitting calls `onNodeRename(nodeId, newLabel)`
- Rename dialog closes on Escape without calling `onNodeRename`
- Clicking the pane closes the context menu
- Node drag stop calls `onLayoutChange` with positions and viewport
- Viewport pan/zoom debounces `onLayoutChange` calls (does not fire immediately)
**Setup needed:** Mock `reactflow` module (ReactFlow, Background, Controls). The component renders ReactFlow which needs DOM measurement APIs -- full mock or `react-flow-renderer` test utilities. This is the highest-effort test in this plan.
**Effort:** High. ~90 minutes. ReactFlow component testing requires careful mocking of the ReactFlow internals (viewport, node positions, events).

---

## What NOT to Test

### `GraphPanel.tsx` changes
Thin wiring layer that passes callbacks from `useDecomposition` to `ProofGraph`. The interesting logic is in the hook (test #3) and the component (test #5). Testing `GraphPanel` would duplicate coverage.

### `ProofGraphNode.tsx`
Not changed in this diff. Pure presentational component.

### `useCausalGraphLayout.ts` changes
Layout algorithm changes are best validated visually. The incremental positioning pattern is tested via `useGraphLayout` (test #2), which uses the same pattern.

### Panel components (`CausalGraphPanel`, etc.)
Changes are `dialecticalMap` -> `balancedPerspectives` renames and minor UI adjustments. Not worth testing -- a typo here is caught by TypeScript, and the visual result is caught by manual testing.

### `workspaceStore.ts` valid-key rename
The `dialecticalMap` -> `balancedPerspectives` rename in `coercePersistedState` is a one-liner change to an array literal. The existing `workspaceStore-hydration.test.ts` tests rehydration, and the rename is protected by the TypeScript `ArtifactKey` type.

### `throttle.ts`
New utility but not changed in this diff (it was introduced in `feat/zustand-wire-page`). Already covered in the prior test strategy review.

---

## Coverage Gaps Beyond Current Scope

These are pre-existing untested areas surfaced by analyzing the graph editing feature's integration points:

1. **`useDecomposition` -> `extractPropositions`** -- The LLM-based extraction path, LaTeX fast path, and PDF fast path are all untested. The graph editing operations compose on top of extraction results.

2. **Persistence round-trip for `decomposition.graphLayout`** -- The Zustand store persists `decomposition` (including `graphLayout`) via its `partialize` function. There is no end-to-end test verifying that graph positions survive a full persist -> rehydrate cycle through the Zustand middleware. Test #1 covers `coerceDecomposition` in isolation, but the Zustand persist path is not covered.

3. **`addGraphEdge` stale closure risk** -- The `useDecomposition.addGraphEdge` callback reads `state.nodes` directly (not via setState updater) to return a synchronous boolean. If React batches a state update between the read and the setState, the edge could be applied to stale state. The code has a comment acknowledging this. A concurrent-mode integration test would be needed to verify this, but is impractical with current tooling.

4. **`page.tsx` orchestration** -- The root component wires `useDecomposition` graph editing methods to `ProofGraph` via `GraphPanel`. No integration test covers this wiring path end-to-end.

---

## Implementation Order

| Order | Tests | Estimated time | Cumulative risk reduced |
|-------|-------|---------------|------------------------|
| 1 | #4 `graphOperations` edge cases | ~30 min | Extends already-good coverage of the core graph mutation layer |
| 2 | #1 `coerceDecomposition` graphLayout validation | ~30 min | Protects against corrupt persisted layout data crashing on load |
| 3 | #2 `useGraphLayout` incremental positioning | ~60 min | Covers the key new abstraction: position persistence + incremental Dagre |
| 4 | #3 `useDecomposition` graph editing hooks | ~45 min | Verifies state management wiring for all graph editing operations |
| 5 | #5 ProofGraph component integration | ~90 min | UI-level integration; lower priority because underlying logic is covered by #1-#4 |

**Total estimated time: ~4 hours** for all recommended tests. Tests 1-3 (the first ~2 hours) cover the highest-value gaps: data integrity on load, core graph operations, and the incremental layout algorithm. Test #4 adds hook-level confidence. Test #5 is optional for this PR -- the underlying logic is well-covered by unit tests, and the component is best verified by manual testing with the ReactFlow canvas.
