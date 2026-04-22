# Spike: Can Zustand replace the useState sprawl in page.tsx incrementally while preserving streaming previews, ref-based accessors, and localStorage persistence?

Date: 2026-04-02
Last verified: 2026-04-02
Relevant paths: app/page.tsx, app/hooks/useWorkspacePersistence.ts, app/hooks/useFormalizationPipeline.ts, app/hooks/useStreamingMerge.ts
Branch: spike/zustand-state-management-2026-04-02 (can be deleted)
Time spent: ~20 minutes

## Answer

Yes. Zustand v5 handles all integration points cleanly. The `persist` middleware replaces the manual debounce/localStorage logic. The `getState()` pattern eliminates the stale-closure ref hacks used by `useFormalizationPipeline`. Artifact versioning (undo/redo/edit history) works as a thin layer within the store. SSR hydration is handled via `skipHydration: true` + `rehydrate()` in a useEffect.

## Key findings

### What worked
- **persist middleware** replaces the entire `scheduleSave`/`flushSave`/`buildSaveInput` pattern in `useWorkspacePersistence.ts`. `partialize` keeps functions out of localStorage. `skipHydration` is SSR-safe.
- **Artifact versioning** as a simple `versions[]` + `currentVersionIndex` within the store. Undo/redo = index navigation. Truncate redo history on new edits. Cap at 20 versions. All tested and working.
- **PipelineAccessors pattern** maps cleanly: `getSemiformal: () => useWorkspaceStore.getState().semiformalText`. No refs needed — `getState()` always returns fresh state by design.
- **Migration from workspace-v2** is straightforward: read old data, call setters. Tested in spike.
- **Snapshot/restore** (for workspace sessions): `getSnapshot()` returns a deep copy, `resetToSnapshot()` sets all state at once. Same API surface as current `useWorkspacePersistence`.
- **Selective re-renders**: React components use `useWorkspaceStore((s) => s.sourceText)` — only re-renders when that specific field changes. No `useMemo` wrappers needed.
- **Streaming previews**: The `useStreamingMerge` hook doesn't need to change. Streaming state can stay in local component state (or a separate transient store). The Zustand store holds final/persisted data only.

### What didn't (or required adjustment)
- **Zustand v5 changed `subscribe` API**: Selector-based subscribe (for vanilla JS, not React) requires `subscribeWithSelector` middleware. Not an issue for React components which use `useStore(selector)` instead.
- **ReactFlow already bundles zustand@4.x internally**: npm nests the versions, so no conflict. But it means zustand is already a transitive dependency — adding it top-level barely changes the dep footprint.

### Surprises or gotchas
- **persist middleware saves synchronously on every `set()` call** by default. During streaming (50ms throttled token callbacks), this would write to localStorage on every token. Solutions: (a) use a custom `storage` adapter with debouncing, (b) keep streaming state outside the persisted store (recommended — streaming is transient).
- **`partialize` is essential**: Without it, Zustand tries to serialize the action functions to localStorage, which fails silently or produces bloated JSON.
- The `functional update` pattern (`setSemiformalText((prev) => prev + "...")`) works natively in Zustand's `set()` — it reads the current state from the updater function argument.

## Recommendation

Proceed to RPI. Zustand is a clear win for this codebase.

## RPI seed

- **Scope for RPI**: Replace `useWorkspacePersistence` and the ~20 useState variables in `page.tsx` with a Zustand store, adding artifact versioning (edit history/undo/redo), while preserving all existing functionality.
- **Known invariants**:
  - Streaming preview state must NOT go through the persisted store (too frequent writes). Keep it in local state or a separate non-persisted store.
  - `skipHydration: true` + `rehydrate()` in useEffect is required for Next.js SSR safety.
  - `partialize` must exclude all action functions from persistence.
  - `PipelineAccessors` should use `getState()` (not selectors) to always read fresh state in async callbacks.
  - Decomposition state is currently separately managed by `useDecomposition` and synced to persistence — this pattern can continue, with the Zustand store as the sync target.
- **Relevant files/APIs**:
  - `app/page.tsx` (lines 62-265): All state declarations and wiring
  - `app/hooks/useWorkspacePersistence.ts`: The hook being replaced
  - `app/hooks/useFormalizationPipeline.ts`: Uses PipelineAccessors pattern (lines 16-32)
  - `app/hooks/useStreamingMerge.ts`: Stays unchanged
  - `app/hooks/useArtifactEditing.ts`: Will use store's `setArtifactEdited` instead of raw setter
  - `app/hooks/useWorkspaceSessions.ts`: Uses `getSnapshot`/`resetToSnapshot` — same API from Zustand store
  - `app/lib/utils/workspacePersistence.ts`: Migration from workspace-v2 data
- **Gotchas to carry forward**:
  - Zustand's persist middleware saves on every `set()` — debounce or exclude transient state.
  - ReactFlow uses zustand@4 internally; our zustand@5 is fine but be aware if debugging store-related issues in ReactFlow.
  - Version history cap (20) is important for localStorage size. Consider also adding a total-size check with fallback to trimming oldest versions.
  - The `flushSave()` pattern (used after generation completes) is handled naturally by persist middleware — but if debouncing is added, need an explicit flush mechanism.
- **What the spike did NOT answer**:
  - Exact migration strategy for `useWorkspaceSessions` (workspace-level sessions that snapshot everything). The snapshot/restore API is compatible, but the dual-store (formalization sessions + workspace sessions) needs design work.
  - How to handle the decomposition store (separate Zustand store? slice of the workspace store?). The spike only tested workspace state.
  - Performance impact of the persist middleware on large workspaces (many nodes with artifact history). May need IndexedDB as a future optimization.
  - How `useFormalizationSessions` (the per-run session history) should interact with the artifact store's version history — potential duplication.
