# API Consistency Review: feat/zustand-wire-page (Loop 2)

**Reviewer:** Claude (API Consistency)
**Branch:** `feat/zustand-wire-page` relative to `main`
**Date:** 2026-04-03
**Loop:** 2 (prior loop found 9 findings; fixes applied in commit 3ed18f8)

## Prior Finding Disposition

| Prior ID | Description | Status |
|----------|-------------|--------|
| F1 (A3) | Snapshot type asymmetry (`WorkspaceState` vs `PersistedWorkspace`) | ACKNOWLEDGED -- intentional bridge, resolves when `useWorkspaceSessions` migrates |
| F2 (A2) | Node coercion less thorough than `loadWorkspace` | FIXED -- `coercePersistedState` now calls `coerceDecomposition` from `workspacePersistence.ts`, reusing the same field-by-field validation |
| F3 (A1) | `ArtifactVersion` fields not validated during rehydration | FIXED -- new `coerceArtifactVersion` validates `id`, `content`, `createdAt`, `source`, and `editInstruction` with type checks and defaults |
| F4 (A8) | Comment overstated persist middleware debouncing | FIXED -- revised to "persist middleware handles serialization lifecycle; custom debounced storage adapter rate-limits writes" |
| F5 (A9) | Comment imprecise about setter stability | FIXED -- revised to "Zustand selectors return the same function identity across state changes, so Object.is comparison prevents re-renders" |
| F6 (A4) | `GenerationProvenance` type unused | FIXED -- removed entirely from `artifactStore.ts` |
| F7 (A5) | `migrateFromV2` used individual setters | FIXED -- single `useWorkspaceStore.setState({...})` call with comment referencing the shared pattern |
| F8 | `file?: File` silently dropped on snapshot | OPEN -- unchanged; acknowledged as intentional (File is non-serializable) |
| F9 | Hardcoded `validKeys` duplicates `ArtifactKey` type | OPEN -- unchanged; low risk, tracked for future cleanup |

---

## Baseline Conventions

Same as Loop 1. Key additions relevant to this loop:

- **Batch setState pattern.** Both `migrateFromV2` and `resetWorkspaceToSnapshot` now consistently use a single `useWorkspaceStore.setState({...})` call. This is the established convention for multi-field updates.
- **Coercion delegation.** `coerceDecomposition` is now the single source of truth for node validation, shared between the Zustand `merge` path and the `loadWorkspace` path.

---

## Findings

### F1. Snapshot type asymmetry (carried forward, acknowledged)

**Severity:** Inconsistent
**Location:** `workspaceStore.ts:204-206` (store interface) vs `page.tsx:108-128` (bridge code)
**Move:** 7 (Look for the asymmetry)
**Confidence:** High

Unchanged from Loop 1. The store's `getSnapshot()` returns `WorkspaceState` (versioned artifacts), but `useWorkspaceSessions` expects `PersistedWorkspace` (flat strings). The bridge in `page.tsx` converts between them. The store's `getSnapshot`/`resetToSnapshot` methods remain unused by any consumer.

Acknowledged as intentional -- the asymmetry resolves when `useWorkspaceSessions` migrates to the Zustand store. No action required this loop.

---

### F2 (NEW). Batch artifact update in `page.tsx` duplicates version-building logic

**Severity:** Minor
**Location:** `page.tsx:332-349` vs `workspaceStore.ts:323-340` (`setArtifactGenerated`)
**Move:** 4 (Check for prior art)
**Confidence:** High

The `handleFormalizationComplete` callback builds `ArtifactRecord` objects inline (lines 338-342) using the same version-capping and index-pointing logic as `setArtifactGenerated` in the store. This was introduced to batch multiple artifact updates into a single `setState` call (replacing N individual `setArtifactGenerated` calls), which is a good efficiency improvement. However, it means the version-building logic now exists in two places.

Additionally, there is a subtle race: `existing` artifacts are read via `getState()` on line 337, but the final merge on line 346 uses a functional `setState((s) => ...)`. If another state update occurs between reading `existing` and calling `setState`, the `artifactUpdates` map could be built against stale artifact data. In practice this is unlikely (the callback runs synchronously), but it breaks the pattern established by `setArtifactGenerated` which reads and writes atomically within a single `set((s) => ...)` call.

**Recommendation:** Extract a `buildArtifactRecord(existing: ArtifactRecord | undefined, content: string, source: ArtifactVersion["source"]): ArtifactRecord` helper from the store and use it in both locations. For the race condition, either read `existing` inside the functional `setState` callback, or document that this is safe because the callback runs synchronously.

---

### F3 (carried forward). `file?: File` silently dropped on snapshot

**Severity:** Minor
**Location:** `workspaceStore.ts` (`WorkspaceState.extractedFiles` type) vs `getSnapshot` (strips `file`)
**Move:** 7 (Look for the asymmetry)
**Confidence:** High

Unchanged. The `partialize` function relies on `JSON.stringify` to silently drop `File` references, while `getSnapshot` explicitly maps to `{ name, text }`. Both approaches work but handle the same concern differently. A `SnapshotExtractedFile` type alias would make the lossy conversion explicit.

---

### F4 (carried forward). Hardcoded `validKeys` duplicates `ArtifactKey` type

**Severity:** Minor
**Location:** `workspaceStore.ts:120`
**Move:** 2 (Check naming against the grain)
**Confidence:** High

Unchanged. The array `["causal-graph", "statistical-model", "property-tests", "dialectical-map", "counterexamples"]` in `coercePersistedState` duplicates the `ArtifactKey` type. Adding a new artifact type requires updating this array, `PERSISTED_ARTIFACT_FIELDS`, and the `ArtifactType` union.

---

## What Looks Good

1. **F2/A2 fix is thorough.** By reusing `coerceDecomposition` from `workspacePersistence.ts`, the Zustand rehydration path now validates every `PropositionNode` field identically to `loadWorkspace`. The `export` change to `coerceDecomposition` is minimal and non-breaking.

2. **F3/A1 fix (`coerceArtifactVersion`) is well-structured.** The new function validates `id` and `content` as required strings (returning `null` if missing), provides sensible defaults for `createdAt` and `source`, and correctly handles the optional `editInstruction` field. The `VALID_ARTIFACT_SOURCES` set is a clean validation pattern.

3. **F7/A5 fix (migration batching) is consistent.** `migrateFromV2` now builds artifacts in a local variable and commits everything in a single `setState` call, with a comment explicitly referencing the matching pattern in `resetWorkspaceToSnapshot`.

4. **Partialize memoization is a nice addition.** The `sanitizeDecomposition` function with reference caching avoids re-mapping decomposition nodes on every `set()` when only unrelated fields changed. This is a meaningful performance improvement for large decomposition graphs.

5. **All 25 store tests pass.** Test coverage for versioning, migration, hydration, and pipeline compatibility remains green.

6. **Comment fixes (A8-A10) are accurate.** The revised comments correctly describe what the persist middleware does vs what the custom adapter does, and how Zustand setter stability works.

---

## Summary Table

| ID | Severity | Status | Location | Description |
|----|----------|--------|----------|-------------|
| F1 | Inconsistent | Carried (acknowledged) | `workspaceStore.ts`, `page.tsx:108-128` | Store snapshot type differs from consumer; bridge is intentional |
| F2 | Minor | NEW | `page.tsx:332-349` | Batch artifact update duplicates version-building logic from store |
| F3 | Minor | Carried | `workspaceStore.ts` | `file?: File` silently dropped with no type distinction |
| F4 | Minor | Carried | `workspaceStore.ts:120` | Hardcoded artifact key array duplicates type definition |

---

## Overall Assessment

The fixes in commit 3ed18f8 successfully resolve 6 of the 9 prior findings. The most important fixes -- A1 (ArtifactVersion field validation) and A2 (node coercion reuse) -- close the two consistency gaps that posed actual data-integrity risk. The migration batching fix (A5) eliminates the internal inconsistency where one code path used batch `setState` and another used individual setters. The comment and dead-code fixes (A4, A8-A10) are clean.

No fixes introduced regressions. One **new Minor finding** (F2) was identified: the batch artifact update in `page.tsx` duplicates version-building logic from the store, introduced as a side effect of optimizing for fewer `setState` calls. This is a maintainability concern, not a correctness issue.

The sole **Inconsistent** finding (F1, snapshot type asymmetry) remains acknowledged as intentional bridge code. The three **Minor** findings (F2-F4) are all maintainability items with no impact on current functionality.

**Verdict:** Approve. All prior Inconsistent findings except the acknowledged bridge (F1) are resolved. The remaining findings are Minor and can be addressed in a follow-up cleanup.
