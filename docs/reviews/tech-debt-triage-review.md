# Tech Debt Triage Review: feat/zustand-wire-page

**Branch:** `feat/zustand-wire-page` (10 commits, 19 files changed vs main)
**Reviewed:** 2026-04-03 (Loop 3, after fix commit `3ed18f8`)
**Prior loops:** Loop 1 found 6 items. Loop 2 applied fixes for items 3 and 5.

This branch replaces the custom `useWorkspacePersistence` React hook with a Zustand store for workspace state management, adds artifact versioning (undo/redo), and rewires `page.tsx` to consume the store directly.

---

## Triage Summary

| # | Debt Item | Nature | Carrying Cost | Fix Cost | Status | Recommendation |
|---|-----------|--------|---------------|----------|--------|----------------|
| 1 | Dead code: `saveWorkspace` / `ArtifactPersistenceData` / `SaveWorkspaceInput` in `workspacePersistence.ts` | structural | Low | hours / low risk | OPEN | Fix opportunistically |
| 2 | Dual localStorage keys (`workspace-v2` + `workspace-zustand-v1`) | structural | Medium | hours / low risk | OPEN | Fix opportunistically |
| 3 | ~~Unused `GenerationProvenance` type in `artifactStore.ts`~~ | structural | -- | -- | RESOLVED in `3ed18f8` | -- |
| 4 | `page.tsx` still orchestrates all state wiring (~500 lines) | structural | Medium | days / medium risk | OPEN | Defer and monitor |
| 5 | Duplicated `isObject` helper; coercion logic partially unified | structural | Low | hours / low risk | PARTIALLY RESOLVED | Fix opportunistically |
| 6 | `resetWorkspaceToSnapshot` loses version history | structural | Low | hours / low risk | OPEN | Carry intentionally |
| 7 | Module-level mutable state in `sanitizeDecomposition` memoization | algorithmic | Low | minutes / low risk | NEW (introduced in `3ed18f8`) | Fix opportunistically |
| 8 | `page.tsx` artifact batch-update duplicates `setArtifactGenerated` logic | structural | Low | minutes / low risk | NEW (introduced in `3ed18f8`) | Fix opportunistically |

---

## Resolved Items

### 3. GenerationProvenance -- RESOLVED

The `GenerationProvenance` type was removed from `app/lib/types/artifactStore.ts` in commit `3ed18f8`. The file now contains only the types that are actively used (`ArtifactKey`, `ArtifactVersion`, `ArtifactRecord`, `MAX_VERSIONS`). No dead exports remain. This is cleanly resolved.

---

## Partially Resolved Items

### 5. Duplicated `isObject` and coercion logic -- PARTIALLY RESOLVED

**What was fixed:** The decomposition coercion in `coercePersistedState` (workspaceStore.ts line 128-131) now delegates to `coerceDecomposition` imported from `workspacePersistence.ts`. This was the higher-severity part of the item -- the Zustand rehydration path now gets the same thorough field-by-field node validation as the v2 migration path. Additionally, `coerceArtifactVersion` was added (lines 68-80), providing field-level validation for artifact versions that was previously missing. This addresses the related finding from the API consistency review (F3).

**What remains:** The `isObject` type guard is still defined identically in both files:
- `workspaceStore.ts` line 62
- `workspacePersistence.ts` line 110

This is a minor duplication (one-liner), and extracting it to a shared util would add a new file for minimal gain. The carrying cost is negligible since both definitions are identical and unlikely to diverge.

**Updated assessment:** The significant part (coercion logic divergence) is fixed. The remaining `isObject` duplication is cosmetic. Downgraded from "Fix opportunistically" to acceptable as-is, though extracting it during any future refactor of these files would be tidy.

---

## Open Items (unchanged)

### 1. Dead code in `workspacePersistence.ts`

**Location:** `app/lib/utils/workspacePersistence.ts` (lines 54-108)
**Status:** OPEN, unchanged from Loop 2.

`saveWorkspace`, `SaveWorkspaceInput`, and `ArtifactPersistenceData` remain exported and tested but have no production callers. The fix commit did not touch these. Carrying cost remains low. Still recommended to fix opportunistically.

### 2. Dual localStorage keys coexisting indefinitely

**Location:** `app/lib/stores/workspaceStore.ts` (lines 474-490)
**Status:** OPEN, unchanged from Loop 2.

The `onRehydrateStorage` callback still checks for the old key on every load without cleaning it up after migration. Carrying cost remains medium. Still recommended to fix opportunistically.

### 4. `page.tsx` remains the monolithic orchestrator

**Location:** `app/page.tsx`
**Status:** OPEN, slightly changed by `3ed18f8`.

The fix commit improved `page.tsx` in two ways: (1) the setter comment was clarified to explain Zustand's `Object.is` mechanism instead of the vague "stable references", and (2) the artifact update callback at lines 329-349 was refactored to batch artifact updates into a single `setState` call instead of N individual `setArtifactGenerated` calls. Both are improvements, but the fundamental issue (500+ lines of orchestration) remains. Still recommended to defer and monitor.

### 6. `resetWorkspaceToSnapshot` discards version history

**Location:** `app/page.tsx` (lines 130-158)
**Status:** OPEN, unchanged from Loop 2.

The fix commit improved `migrateFromV2` to use batch `setState` (matching `resetWorkspaceToSnapshot`'s pattern), but `resetWorkspaceToSnapshot` itself still discards version history. Still recommended to carry intentionally.

---

## New Items Introduced by Fix Commit

### 7. Module-level mutable state in `sanitizeDecomposition`

**Location:** `app/lib/stores/workspaceStore.ts` (lines 291-308)
**Nature:** algorithmic

The fix commit added a memoization optimization for `sanitizeDecomposition` using module-level variables `_lastDecompRef` and `_lastDecompSanitized`. This is a reasonable optimization (avoids re-mapping nodes on every unrelated `set()` call), but it introduces module-level mutable state that:

1. Would not be reset between tests unless the module is re-imported. If a test mutates decomposition and a subsequent test expects clean state, they could interact.
2. Creates a subtle reference-equality dependency -- if any code path creates a new decomposition object with identical content but a different reference, the memoization will miss and re-compute.

Neither issue is likely to cause bugs in practice (the memoization is purely an optimization, and the fallback path produces correct results). But it is worth noting as a pattern to avoid proliferating.

**Carrying Cost:** Low
**Fix Cost:** Minutes (replace with a WeakRef-based approach, or just remove the memoization if profiling shows it is unnecessary)
**Recommendation:** Fix opportunistically. Consider whether the optimization is measurable -- if decomposition has fewer than ~100 nodes in practice, the `map` call is negligible and the memoization adds complexity for no user-visible benefit.

### 8. Artifact batch-update in `page.tsx` duplicates `setArtifactGenerated` logic

**Location:** `app/page.tsx` (lines 331-349)
**Nature:** structural

The fix commit refactored the artifact update callback to batch updates via `setState` instead of calling `setArtifactGenerated` N times. However, the batched version manually reimplements the version-slicing logic from `setArtifactGenerated` (lines 339-346):

```typescript
const versions = existing
  ? [...existing.versions.slice(-MAX_VERSIONS + 1), version]
  : [version];
artifactUpdates[key] = { type: key, currentVersionIndex: versions.length - 1, versions };
```

This is the same logic as `setArtifactGenerated` in workspaceStore.ts (lines 342-355). If the versioning cap or truncation behavior changes, it must be updated in both places.

**Carrying Cost:** Low (the logic is simple and unlikely to change)
**Fix Cost:** Minutes (extract a helper like `appendGeneratedVersion(existing, content)` and use it in both locations)
**Recommendation:** Fix opportunistically. A shared helper would be cleaner but is not urgent.

---

## Debt Addressed by This Branch

For completeness, the branch resolves the following pre-existing debt:

1. **Manual debounced localStorage persistence** -- The `useWorkspacePersistence` hook's `scheduleSave`/`stateRef`/`decompRef`/`artifactRef` pattern (~100 lines of ref-juggling) is replaced by Zustand's `persist` middleware with a debounced storage adapter (~20 lines). Net reduction in hand-rolled persistence logic.

2. **Stale closure risk in `PipelineAccessors`** -- The old pattern required `stateRef` indirection to avoid stale closures in async callbacks. The new pattern uses `useWorkspaceStore.getState()` which always returns fresh state by design. The pipeline accessors in page.tsx (lines 393-401) are now straightforward and correct.

3. **No artifact edit history** -- Structured artifacts (causal-graph, statistical-model, etc.) were stored as flat JSON strings with no history. The new `ArtifactRecord` with `versions[]` and `currentVersionIndex` enables undo/redo, capped at 20 versions. Well-tested (14 versioning tests).

4. **Scattered state setters** -- 13 `useCallback`-wrapped setters in `useWorkspacePersistence` are replaced by Zustand's built-in action functions, which are stable references by default. This removes ~40 lines of boilerplate.

5. **Stray `partial-json` dependency** -- Was present in an earlier commit but removed in `270f7de`.

6. **`GenerationProvenance` dead type** -- Removed in `3ed18f8`.

7. **Weak artifact version validation** -- `coerceArtifactVersion` added in `3ed18f8` now validates `id`, `content`, `createdAt`, `source`, and `editInstruction` fields individually.

8. **Decomposition coercion divergence** -- `coercePersistedState` now delegates to the shared `coerceDecomposition` function instead of maintaining a separate, weaker implementation.

9. **`migrateFromV2` used N individual setters** -- Refactored to a single `setState` call in `3ed18f8`, matching the pattern in `resetWorkspaceToSnapshot`.
