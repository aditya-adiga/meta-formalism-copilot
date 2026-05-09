# Test Strategy Review: feat/zustand-wire-page (Loop 2)

**Date:** 2026-04-03
**Branch:** `feat/zustand-wire-page` vs `main`
**Fix commit:** `3ed18f8` (fix: address code review findings A1-A10)
**Scope:** New validation functions, memoization, batched state updates

---

## What Changed in the Fix Commit

The fix commit introduced four categories of new logic:

### 1. `coerceArtifactVersion` (field-level validation)
- New function at line 69 of `workspaceStore.ts`
- Validates individual `ArtifactVersion` objects from deserialized JSON
- Checks `id` (string, required), `content` (string, required), `createdAt` (string, defaults to `new Date().toISOString()`), `source` (enum validated against `VALID_ARTIFACT_SOURCES`, defaults to `"generated"`), `editInstruction` (optional string)
- Returns `null` for invalid entries, which are then filtered out by `coerceArtifactRecord`

### 2. `sanitizeDecomposition` memoization
- Module-level cache (`_lastDecompRef` / `_lastDecompSanitized`) at line 291
- Returns cached result when the input reference is unchanged
- Used in `partialize` to avoid re-mapping decomposition nodes on every `set()` call

### 3. Batched `storeArtifactResults` in `page.tsx`
- Replaced N individual `setArtifactGenerated` calls with a single `useWorkspaceStore.setState()`
- Builds `ArtifactRecord` objects inline, including `MAX_VERSIONS` cap logic via `.slice(-MAX_VERSIONS + 1)`

### 4. Batched `migrateFromV2`
- Replaced N individual setter calls with a single `useWorkspaceStore.setState()`
- Builds artifact records inline from flat `PersistedWorkspace` strings

### 5. Decomposition coercion delegation
- `coercePersistedState` now delegates to the exported `coerceDecomposition()` from `workspacePersistence.ts` instead of inline coercion
- This is a de-duplication, not new logic -- `coerceDecomposition` already has tests in `workspacePersistence.test.ts`

---

## Prior Recommendations: Status Update

| # | Test | Status | Notes |
|---|-------|--------|-------|
| 1 | `resolveArtifactContent` edge cases | **Still valid, high priority** | No changes to this function. Still untested for degenerate inputs. |
| 2 | Undo/redo no-ops on boundaries | **Still valid, high priority** | No changes to undo/redo logic. |
| 3 | `onRehydrateStorage` auto-migration | **Still valid, high priority** | Migration logic changed (batched setState), but the test approach is the same. |
| 4 | Snapshot bridge round-trip | **Still valid, high priority** | No changes to snapshot bridge functions in this commit. |
| 5 | `clearWorkspace` persistence round-trip | **Still valid, medium priority** | No changes. |
| 6 | Multiple artifact types independence | **Still valid, medium priority** | The batched `storeArtifactResults` makes this slightly more important -- a bug in the spread pattern could clobber other artifact keys. |
| 7 | Corrupted localStorage resilience | **Priority increased** | `coerceArtifactVersion` is new validation logic specifically for this scenario. The existing hydration test uses well-formed data. |
| 8 | Debounced storage adapter | **Still valid, low priority** | No changes. |

---

## New Test Recommendations from Fix Commit

### 9. `coerceArtifactVersion` field validation
- **Type:** Unit
- **Priority:** High
- **File:** `app/lib/stores/__tests__/workspaceStore-hydration.test.ts`
- **What it verifies:** The new per-version validation rejects malformed versions and applies correct defaults.
- **Key cases:**
  - Non-object input (string, number, null, array) returns `null`
  - Missing `id` field returns `null`
  - Missing `content` field returns `null`
  - Missing `createdAt` defaults to an ISO string (not crash)
  - Invalid `source` value (e.g., `"hacked"`) defaults to `"generated"`
  - Valid `source` values (`"generated"`, `"ai-edit"`, `"manual-edit"`) are preserved
  - `editInstruction` present as string is preserved; non-string is dropped
  - Mixed valid/invalid versions in an array: valid ones survive, invalid ones are filtered
- **Why this matters:** This is the innermost validation gate for persisted data. Prior to this commit, `coerceArtifactRecord` did `versions.filter(isObject)` -- a much weaker check that accepted any object as a valid version. The new function is stricter (requires `id` and `content`), which is better, but the strictness itself needs testing to ensure real persisted data passes.
- **Setup needed:** `coerceArtifactVersion` is not exported. Test indirectly by feeding malformed version data through `rehydrate()` with pre-populated localStorage containing a `workspace-zustand-v1` key with bad version entries.
- **Risk reduced:** High. A regression here silently drops user artifact history.

### 10. `sanitizeDecomposition` memoization correctness
- **Type:** Unit
- **Priority:** Medium
- **File:** `app/lib/stores/__tests__/workspaceStore-hydration.test.ts`
- **What it verifies:** The module-level memoization cache returns correct results and does not serve stale data.
- **Key cases:**
  - Same decomposition reference twice: second call returns `===` same result (referential equality)
  - Different decomposition reference: returns fresh sanitized result, not the cached one
  - Decomposition with a node that has `verificationStatus: "verifying"`: sanitized to valid status
  - Empty nodes array: does not crash, returns valid structure
- **Why this matters:** Module-level mutable state (`_lastDecompRef`, `_lastDecompSanitized`) is a classic source of test-order-dependent bugs. The cache is never cleared -- if a test sets decomposition, the cached reference persists into subsequent tests. The `beforeEach` reset (`useWorkspaceStore.setState(useWorkspaceStore.getInitialState())`) does NOT reset these module-level variables.
- **Setup needed:** `sanitizeDecomposition` is not exported. Test indirectly: set decomposition on the store, flush the persist timer, read from localStorage, verify the persisted decomposition has sanitized statuses. Then change decomposition and verify the new value is persisted (not the cached one).
- **Risk reduced:** Medium. A stale cache bug would cause silent data corruption where the wrong decomposition is persisted. The reference-equality check makes this unlikely for real usage (Zustand creates new objects on state change), but the module-level mutation is unusual enough to warrant a regression test.

### 11. Batched `storeArtifactResults` version cap
- **Type:** Unit
- **Priority:** Medium
- **File:** `app/lib/stores/__tests__/workspaceStore.test.ts`
- **What it verifies:** The inline version-cap logic in `page.tsx`'s `storeArtifactResults` correctly caps at `MAX_VERSIONS` and preserves the existing version history.
- **Key cases:**
  - Store 25 versions via repeated `storeArtifactResults`-style updates, verify cap at 20
  - First generation (no existing record) creates a single-version record
  - Generation with existing 5-version record appends and sets `currentVersionIndex` to 5
- **Why this matters:** The `storeArtifactResults` callback duplicates version-management logic that already exists in `setArtifactGenerated`. The inline version uses `.slice(-MAX_VERSIONS + 1)` while the store action uses `.slice(-(MAX_VERSIONS - 1))` -- these are equivalent, but the duplication means a future change to one might not propagate to the other. Testing both paths catches divergence.
- **Setup needed:** Cannot test `storeArtifactResults` directly (it's a `useCallback` inside `page.tsx`). Instead, test the equivalent operation: build artifact records with the same slice logic and verify via `useWorkspaceStore.setState()`. Alternatively, extract the version-append-and-cap logic into a shared helper (recommended refactor).
- **Risk reduced:** Medium. Version cap bugs cause unbounded localStorage growth, eventually hitting quota limits.

---

## Summary of All Recommendations

| Priority | Tests | Status |
|----------|-------|--------|
| **High** | #1 resolveArtifactContent edges, #2 undo/redo no-ops, #3 auto-migration path, #4 snapshot bridge, #9 coerceArtifactVersion | 5 tests |
| **Medium** | #5 clearWorkspace round-trip, #6 artifact independence, #7 corrupted localStorage (priority raised), #10 sanitizeDecomposition memo, #11 batched version cap | 5 tests |
| **Low** | #8 debounced storage adapter | 1 test |

### Implementation order recommendation

Start with #9 (coerceArtifactVersion) and #7 (corrupted localStorage) -- these are closely related and test the same code path (malformed data through rehydration). Then #1 and #2 (quick pure-function tests). Then #3 (auto-migration with the new batched setState). The remaining medium-priority tests can follow.

---

## Refactoring Suggestion

The fix commit created a **second copy** of the version-append-and-cap logic. `setArtifactGenerated` in the store and `storeArtifactResults` in `page.tsx` both independently build `ArtifactRecord` objects with version slicing. Consider extracting a shared `appendArtifactVersion(existing: ArtifactRecord | undefined, content: string, source: ArtifactVersion["source"]): ArtifactRecord` helper. This would:
- Eliminate the duplication
- Make the logic directly unit-testable (addressing #11 without needing to mock page.tsx)
- Reduce the risk of the two paths diverging in future changes

---

## Coverage Gaps Beyond Current Scope

Unchanged from Loop 1. The four adjacent untested areas remain:
1. `useWorkspaceSessions` hook (snapshot bridge consumer)
2. `useFormalizationPipeline` with Zustand accessors
3. `useDecomposition` + persistence sync effect
4. localStorage quota handling (regression from old `saveWorkspace`)
