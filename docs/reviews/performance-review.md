# Performance Code Review: `feat/graph-persistence-editing` branch

**Branch:** `feat/graph-persistence-editing`
**Base:** `main`
**Reviewer:** Performance review (automated)
**Date:** 2026-04-03
**Scope:** All files changed on branch (~86 files, +6679/-1615 lines). Focus on hot paths, state management, streaming, serialization, and scaling behavior.

## Data Flow and Hot Paths

The branch introduces or modifies several performance-critical paths:

1. **Keystroke path (hot):** User types in `TextInput` or `ContextInput` -> `setSourceText`/`setContextText` on Zustand store -> `partialize()` runs synchronously -> debounced `setItem` coalesces writes at 300ms. The `partialize` function runs at keystroke frequency (~10-30 calls/sec during typing).

2. **Streaming token path (hot):** SSE tokens arrive at ~66/sec (20-char chunks, 15ms simulated delay). Each token -> throttled callback (50ms) -> `parsePartialJson` -> `setStreamingJsonPreview` React state update. For Anthropic streams, token rate depends on model but is typically 30-100 tokens/sec.

3. **Workspace auto-save (periodic):** Every 5 seconds, `saveCurrentSession` snapshots the entire workspace via `getWorkspaceSnapshot()` + `getSessionsSnapshot()`, serializes to JSON, and writes to localStorage. This involves `structuredClone` of decomposition and artifacts.

4. **Decomposition sync (effect):** Every time `decomp.nodes`, `selectedNodeId`, `paperText`, `sources`, or `graphLayout` changes, a `useEffect` persists the full decomposition to the Zustand store (`setDecomposition`), triggering `partialize()` and the debounced localStorage write.

5. **Artifact generation completion:** `storeArtifactResults` runs once per generation batch. Iterates over results (up to 5 artifact types), calling `updateSessionArtifact` + `updateNode` + `setArtifactsBatchGenerated`.

6. **Causal graph layout (render-time):** `useCausalGraphLayout` runs Dagre layout inside `useMemo` when `causalGraph` reference changes, which happens on every streaming preview update.

**Assumed data sizes:**
- Source text: typically 500-10,000 chars; up to ~50,000 for uploaded PDFs
- Decomposition nodes: typically 5-50 nodes; theoretical max ~200 for large papers
- Artifact JSON: 1-10KB per artifact type; 5 artifact types
- Workspace sessions: 1-5 sessions in localStorage; each session stores full workspace snapshot
- Version history: capped at MAX_VERSIONS=20 per artifact type

## Findings

#### F1. Workspace auto-save serializes entire workspace every 5 seconds unconditionally

**Severity:** Medium
**Location:** `app/hooks/useWorkspaceSessions.ts:221-228`
**Move:** Serialization tax (Move 6)
**Confidence:** High

The `saveCurrentSession` function runs on a 5-second interval regardless of whether any state has changed. Each invocation calls `getWorkspaceSnapshot()` which performs `structuredClone` on both the decomposition and artifacts objects (lines 452-453 of `workspaceStore.ts`), then `JSON.stringify`s the entire `WorkspaceSessionsState` (including all sessions) for localStorage persistence.

For a workspace with 3 sessions, 50 decomposition nodes, and 5 artifact types each with version history, the serialized state could be 100-500KB. `structuredClone` + `JSON.stringify` at this size takes 1-5ms, running every 5 seconds regardless of changes.

**Recommendation:** Add a dirty flag or generation counter that increments on any store mutation. Skip the save if the counter has not changed since the last save. This eliminates the serialization cost entirely when the user is idle (the common case between typing bursts).

#### F2. Throttle drops intermediate calls instead of delivering trailing edge

**Severity:** Medium
**Location:** `app/lib/utils/throttle.ts:19-25`
**Move:** Work that moved to the wrong place (Move 3)
**Confidence:** High

The fact-check report (Claim 13) correctly identified this: when the throttle timer is pending and a new call arrives, the new call is silently dropped (the `else if (!timer)` guard on line 19 means only the first call after the leading edge sets a trailing timer). Subsequent calls during the trailing window are lost.

On the streaming path, this means: if 3 tokens arrive within 50ms, only the first token's accumulated text gets delivered. The second and third are dropped, and the user never sees them until the next leading-edge call. This creates visually "jumpy" streaming updates where the preview skips chunks.

The JSDoc comment (line 2) says "The last call is always delivered" but this is not true -- only the *second* call after the leading edge is delivered (via the trailing timer), and all subsequent calls before the timer fires are dropped.

**Recommendation:** Update the throttle to store the latest args and deliver them on trailing edge:
```typescript
} else {
  // Always update to latest args so trailing edge delivers the most recent call
  pendingArgs = args;
  if (!timer) {
    timer = setTimeout(() => {
      lastRun = Date.now();
      timer = null;
      fn(...pendingArgs);
    }, remaining);
  }
}
```

#### F3. Dagre layout runs on every streaming preview update during generation

**Severity:** Medium
**Location:** `app/components/features/causal-graph/useCausalGraphLayout.ts:34-125`
**Move:** Count the hidden multiplications (Move 1)
**Confidence:** Medium

The `useMemo` depends on the `causalGraph` reference (line 125). During streaming, `streamingJsonPreview` provides a new parsed object on every throttled token callback (~20 times/sec after throttling). The `useStreamingMerge` hook in `CausalGraphPanel` picks `streamingPreview` as `displayData` when `finalData` is null, passing it to `useCausalGraphLayout`.

Each invocation checks `newNodeIds.length > 0` and only runs Dagre for new nodes (good incremental design). However, the function still:
- Creates a `Set` of confounders (line 49)
- Filters variables for new nodes (line 63)
- Maps all variables to ReactFlow nodes (lines 109-122)
- Maps all edges to ReactFlow edges (lines 91-106)

For a graph with 20 variables and 30 edges, this is ~50 object allocations per streaming update. At 20 updates/sec during generation, that is ~1000 allocations/sec. Not catastrophic, but the Dagre layout (line 78) could also run repeatedly as new nodes appear in the partial JSON.

**Recommendation:** Memoize the ReactFlow node/edge arrays separately from the Dagre layout. Consider a shallow-comparison check (e.g., comparing `variables.length` and `edges.length`) to skip the full rebuild when only descriptions are streaming in but the graph structure has not changed.

#### F4. `storeArtifactResults` performs linear scan per artifact type for node upsert

**Severity:** Low
**Location:** `app/page.tsx:351-357`
**Move:** Ask "what's the size of N?" (Move 2)
**Confidence:** High

When storing results for a node, the function calls `decomp.nodes.find((n) => n.id === nodeId)` inside a loop over artifact types (up to 5 iterations). Each `find` is O(N) over the nodes array. Additionally, `artifacts.filter((a) => a.type !== artifactType)` scans the node's artifact list.

With N=50 nodes and up to 5 artifact types, this is 5 * 50 = 250 comparisons per generation. The `updateNode` call on each iteration also likely triggers a state update, meaning up to 5 individual `setState` calls with the decomposition array.

The absolute cost is small (sub-millisecond), but the unbatched `updateNode` calls each propagate through the decomposition sync effect (line 270-278 of page.tsx), triggering `setDecomposition` on the Zustand store.

**Recommendation:** Look up the node once before the loop and batch the artifact updates into a single `updateNode` call.

#### F5. `EditableSection` serializes value on every render for change detection

**Severity:** Low
**Location:** `app/components/features/output-editing/EditableSection.tsx:36`
**Move:** Serialization tax (Move 6)
**Confidence:** Medium

`const serialized = JSON.stringify(value)` runs on every render of every `EditableSection`. In the CausalGraphPanel details view, there is one `EditableSection` per variable, edge, confounder, plus the summary -- potentially 50+ sections. Each serializes its `value` prop.

Most of these `value` props are small objects (3-5 fields), so the per-call cost is microseconds. But during streaming preview updates (~20/sec), every `EditableSection` re-renders and re-serializes because the parent `displayData` reference changes.

**Recommendation:** Move the `JSON.stringify` inside the `useEffect` that compares `prevSerializedRef`, or use `useRef` with a comparison function to avoid serialization when the component is not in editing mode.

#### F6. Decomposition sync effect triggers on every node selection change

**Severity:** Low
**Location:** `app/page.tsx:270-278`
**Move:** Hidden multiplication (Move 1)
**Confidence:** High

The `useEffect` that syncs decomposition to the Zustand store lists `decomp.selectedNodeId` as a dependency. Clicking a different node in the graph triggers a full `setDecomposition` call, which runs `partialize()` (with the `sanitizeDecomposition` memoization, this is O(1) if nodes have not changed) and the debounced localStorage write.

This is correctly mitigated by the `sanitizeDecomposition` memoization for the partialize path and the 300ms localStorage debounce. The remaining cost is the `setDecomposition` shallow merge and 21 selector evaluations -- on the order of microseconds.

**Recommendation:** No action needed. The memoization and debounce make this a negligible cost. Noted for completeness.

#### F7. `useAllArtifactEditing` instantiates 5 hooks unconditionally

**Severity:** Informational
**Location:** `app/hooks/useArtifactEditing.ts:72-115`
**Move:** Work that moved to the wrong place (Move 3)
**Confidence:** Low

`useAllArtifactEditing` always creates 5 `useArtifactEditing` instances (one per artifact type), each with a `useWaitTimeEstimate` hook. These are all active regardless of which panel the user is viewing. The hooks are lightweight (just state + callbacks), so the overhead is minimal.

**Recommendation:** No action needed at current scale. If more artifact types are added, consider lazy initialization.

#### F8. `handleRestoreSession` calls `setArtifactGenerated` per-artifact (residual)

**Severity:** Low
**Location:** `app/page.tsx:300-311`
**Move:** Hidden multiplication (Move 1)
**Confidence:** High

Previously identified in the existing performance review (F2). The loop calls `setArtifactGenerated` individually for each artifact in `session.artifacts` (up to 5 calls), each triggering `set()` -> `partialize()` -> 21 selector evaluations. This is a user-initiated action (session restore) so absolute impact is small.

**Recommendation:** Batch into a single `setArtifactsBatchGenerated` call, consistent with `storeArtifactResults`.

## What Looks Good

1. **Debounced localStorage writes at 300ms.** The `createDebouncedStorage` adapter correctly coalesces rapid state updates into a single localStorage write. This is the most impactful performance pattern in the store, preventing JSON.stringify on every keystroke.

2. **`sanitizeDecomposition` memoization.** The module-level reference-equality cache (lines 292-309 of workspaceStore.ts) correctly skips O(N) node mapping in `partialize` when only unrelated state changes. This removes the main per-keystroke scaling bottleneck.

3. **Throttled streaming callbacks at 50ms.** The `useArtifactGeneration` hook throttles both semiformal text updates and partial-JSON parsing to 50ms intervals, preventing React from batching hundreds of state updates per second during LLM streaming.

4. **Incremental Dagre layout.** The `useCausalGraphLayout` hook only runs Dagre for new nodes, preserving existing positions. The `edgesJustArrived` detection correctly handles the transition from position-only to edge-aware layout without unnecessary full re-layouts.

5. **Version capping at MAX_VERSIONS=20.** The `slice(-MAX_VERSIONS + 1)` pattern in both `setArtifactGenerated` and `setArtifactEdited` prevents unbounded version history growth. At 20 versions of ~5KB each, per-artifact storage is bounded at ~100KB.

6. **`skipHydration: true` for SSR safety.** Defers Zustand hydration to `useEffect`, preventing hydration mismatch errors and avoiding unnecessary server-side localStorage access.

7. **Stable Zustand selector functions.** The top-level `artifactSelector` factory (page.tsx lines 44-51) creates selector functions once at module load, not inside the component. This prevents selector identity changes on every render.

8. **`setArtifactsBatchGenerated` batching.** The store action correctly merges multiple artifact updates into a single `set()` call, reducing the selector evaluation overhead from 5x to 1x on the artifact generation completion path.

9. **Streaming preview is kept outside the Zustand store.** Transient streaming state (`streamingPreview`, `streamingJsonPreview`) lives in React `useState` in `useArtifactGeneration`, avoiding high-frequency Zustand `set()` calls and the associated `partialize` + serialization overhead.

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| F1 | Auto-save serializes workspace every 5s unconditionally | Medium | useWorkspaceSessions.ts:221-228 | High |
| F2 | Throttle drops intermediate calls (not true trailing edge) | Medium | throttle.ts:19-25 | High |
| F3 | Dagre layout hook rebuilds node/edge arrays on every streaming update | Medium | useCausalGraphLayout.ts:34-125 | Medium |
| F4 | Linear scan + unbatched updateNode per artifact in storeArtifactResults | Low | page.tsx:351-357 | High |
| F5 | EditableSection JSON.stringify on every render for change detection | Low | EditableSection.tsx:36 | Medium |
| F6 | Decomposition sync effect triggers on node selection (mitigated) | Low | page.tsx:270-278 | High |
| F7 | 5 editing hooks instantiated unconditionally | Informational | useArtifactEditing.ts:72-115 | Low |
| F8 | handleRestoreSession unbatched setArtifactGenerated (residual) | Low | page.tsx:300-311 | High |

## Overall Assessment

The codebase demonstrates strong performance awareness in its architecture. The Zustand store migration correctly separates transient streaming state from persisted state, debounces localStorage writes, memoizes the decomposition sanitization in `partialize`, and batches artifact updates on the generation path. The streaming pipeline is well-throttled and uses incremental layout for graph visualization.

The three medium-severity findings represent real optimization opportunities:

- **F1** (unconditional 5-second auto-save) is the most impactful -- it performs `structuredClone` + `JSON.stringify` of potentially hundreds of KB of data every 5 seconds even when the user is idle. A dirty flag would eliminate this waste entirely.
- **F2** (throttle dropping trailing calls) causes visually choppy streaming updates. The fix is straightforward and improves user experience.
- **F3** (Dagre layout on streaming updates) performs unnecessary array rebuilds during streaming but is bounded by the throttle rate and the incremental Dagre optimization.

None of these findings are blocking -- the application will function correctly and perform acceptably for typical workloads (single user, <50 nodes, <5 sessions). The recommendations are improvements for smoothness and efficiency, not corrections for correctness or scaling failures.
