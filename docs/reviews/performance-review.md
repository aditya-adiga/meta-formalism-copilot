# Performance Code Review: Zustand State Management Migration (Loop 2)

**Branch:** `feat/zustand-wire-page`
**Reviewer:** Performance review (Loop 2)
**Date:** 2026-04-03
**Scope:** `workspaceStore.ts`, `page.tsx`, `artifactStore.ts`, tests, package.json
**Prior loop:** 8 findings (2 Medium, 3 Low, 3 Informational). Fixes applied in commit 3ed18f8.

## Data Flow and Hot Paths

Unchanged from Loop 1. The critical performance paths are:

1. **Keystroke path:** setter -> `set()` -> `partialize()` (synchronous) -> debounced `setItem` (300ms coalesce) -> `JSON.stringify` + `localStorage.setItem`. The `partialize` function runs at keystroke frequency; serialization and I/O are debounced.

2. **Selector evaluation:** Every `set()` call evaluates all 21 active selectors in `page.tsx` via `Object.is` comparison. Cost: ~21 function calls + 21 comparisons per `set()` (microseconds).

3. **Artifact generation:** Now batched into a single `set()` call via `storeArtifactResults`. Previously 5 separate `set()` calls.

4. **Snapshot/restore:** Infrequent (user-initiated session switch). Uses `structuredClone`.

## Fix Verification

### F1/A6: `sanitizeDecomposition` memoization — CORRECT

**Location:** `app/lib/stores/workspaceStore.ts:288-308`

The memoization uses reference equality (`===`) on the `decomposition` object to skip re-mapping nodes when the decomposition has not changed. This is correct because:

- Zustand's `set()` returns new state objects via spread, so unchanged fields keep their object identity. When `set({ sourceText: "..." })` is called, `state.decomposition` retains the same reference.
- `sanitizeNodeStatus` is a pure function (maps to one of 3 valid strings or "unverified"), so the memoized result is stable for a given input.
- The module-level `_lastDecompRef` / `_lastDecompSanitized` variables are appropriate since there is exactly one store instance.

On the keystroke path, this reduces `partialize` from O(N) node allocations to O(1) reference comparison when decomposition has not changed. This fully resolves the original F1 finding.

No new issue introduced.

### F2/A7: `storeArtifactResults` batching — CORRECT WITH CAVEAT

**Location:** `app/page.tsx:332-349`

The batched implementation correctly replicates `setArtifactGenerated` behavior:

- Version capping: `existing.versions.slice(-MAX_VERSIONS + 1)` matches the store's `setArtifactGenerated` (line 344 in workspaceStore.ts).
- `currentVersionIndex: versions.length - 1` matches the store implementation.
- `makeVersion(content, "generated")` produces the same version shape.
- The `setState` callback form (`(s) => ({ artifacts: { ...s.artifacts, ...artifactUpdates } })`) correctly merges with current state.

**Caveat (new, Low):** The `existing` variable is read from `getState()` on line 337, outside the `setState` callback on line 346. Since JavaScript is single-threaded and no `await` intervenes between lines 334-349, the state cannot change between the reads and the write. However, if this code were ever made async (e.g., awaiting between artifact processing), the `getState()` reads would become stale. The `setArtifactGenerated` store method avoids this by reading `existing` inside the `set()` callback. This is not a bug today but is a fragility worth noting. See F1 below.

### F3/A5: `migrateFromV2` batching — CORRECT

**Location:** `app/lib/stores/workspaceStore.ts:252-283`

Single `setState` call replaces 13+ individual setter calls. The artifact records are built correctly with `makeVersion` and the right structure. Migration runs at most once per user. No issues.

### F4/A4: `GenerationProvenance` removal — CORRECT

**Location:** `app/lib/types/artifactStore.ts`

The unused type has been removed. The file now contains only actively-used types. No issues.

## Findings

### F1. `storeArtifactResults` reads `existing` outside `setState` callback

**Severity:** Low
**Location:** `app/page.tsx:337`
**Move:** Premature read (Move 5 variant — reading state snapshot before entering the atomic update)
**Confidence:** Medium

```ts
const existing = useWorkspaceStore.getState().artifacts[key]; // line 337 — read
// ... build artifactUpdates ...
useWorkspaceStore.setState((s) => ({                          // line 346 — write
  artifacts: { ...s.artifacts, ...artifactUpdates },
});
```

The `existing` read on line 337 happens outside the `setState` callback. The `artifactUpdates` map is built with potentially stale `existing` data. Today this is safe because the code is synchronous with no intervening state changes. But it diverges from the pattern used by `setArtifactGenerated` (which reads `existing` inside the `set()` callback), creating an inconsistency that could become a bug if the surrounding code changes.

**Recommendation:** Move the `existing` read and `artifactUpdates` construction inside the `setState` callback:

```ts
useWorkspaceStore.setState((s) => {
  const updates: Partial<Record<ArtifactKey, ArtifactRecord>> = {};
  for (const key of Object.values(PERSISTED_ARTIFACT_FIELDS)) {
    if (results[key]) {
      const content = typeof results[key] === "string" ? results[key] as string : JSON.stringify(results[key]);
      const existing = s.artifacts[key];
      const version = makeVersion(content, "generated");
      const versions = existing
        ? [...existing.versions.slice(-MAX_VERSIONS + 1), version]
        : [version];
      updates[key] = { type: key, currentVersionIndex: versions.length - 1, versions };
    }
  }
  return { artifacts: { ...s.artifacts, ...updates } };
});
```

### F2. `handleRestoreSession` still calls `setArtifactGenerated` individually per artifact

**Severity:** Low
**Location:** `app/page.tsx:272-283`
**Move:** Hidden multiplication (Move 1)
**Confidence:** High

The `handleRestoreSession` callback loops over `session.artifacts` and calls `setArtifactGenerated` individually for each artifact type (up to 5 calls). This was not addressed in the prior loop's fixes for F2, though it follows the same unbatched pattern.

Combined with the 5 individual setter calls on lines 265-269 (for non-decomposition restore), a session restore can trigger up to 10 separate `set()` calls. Each runs `partialize` (now O(1) for decomposition thanks to the memoization fix) and evaluates 21 selectors.

This is a user-initiated action (session switch), so the absolute cost is small. But it would be cleaner to batch the artifact updates the same way `storeArtifactResults` now does.

**Recommendation:** Batch the artifact restore into a single `setState` call, consistent with the pattern established in `storeArtifactResults`. Optionally, also batch the 5 setter calls on lines 265-269 into a single `setState`.

### F3. Double `JSON.stringify` in `storeArtifactResults` (residual from Loop 1 F5)

**Severity:** Low
**Location:** `app/page.tsx:309, 336`
**Move:** Serialization tax (Move 6)
**Confidence:** Medium

The prior loop's F5 finding (double `JSON.stringify`) was not addressed. The first loop (lines 306-329) computes `content` via `JSON.stringify` for session/node updates. The second loop (lines 334-344) re-computes content from the raw `results[key]` object. Both loops stringify the same values independently.

For typical artifact sizes (1-10KB JSON), the waste is a few hundred microseconds -- negligible in absolute terms. This is a code quality issue more than a performance issue.

**Recommendation:** Build a `Map<ArtifactKey, string>` of serialized content in the first loop and reuse it in the second loop.

### F4. 21 individual selector subscriptions (residual from Loop 1 F4)

**Severity:** Informational
**Location:** `app/page.tsx:84-101`
**Move:** Find the contention point (Move 7)
**Confidence:** Medium

Unchanged from Loop 1. 21 `useWorkspaceStore(...)` calls evaluate on every `set()`. The comment on lines 92-93 was improved to correctly describe the `Object.is` mechanism. The count is fine for current usage but does not scale well.

No action needed at this time.

## What Looks Good

1. **`sanitizeDecomposition` memoization is well-placed and correct.** Module-level cache with reference equality is the right approach for a single-instance store. The comment block (lines 288-290) clearly explains the purpose.

2. **`migrateFromV2` batching is clean.** The single `setState` call with a comment referencing the matching pattern in `resetWorkspaceToSnapshot` helps readers understand the consistency.

3. **`storeArtifactResults` batching correctly replicates version capping.** The `slice(-MAX_VERSIONS + 1)` and `currentVersionIndex: versions.length - 1` match the store's `setArtifactGenerated` exactly.

4. **Comment improvements are accurate.** The docstring fix (line 5: "persist middleware handles serialization lifecycle; custom debounced storage adapter rate-limits writes") and the selector comment fix (lines 92-93) correctly describe the actual mechanisms.

5. **`coerceArtifactVersion` validation is thorough.** The new per-version validation (lines 69-79) catches corrupted localStorage data that the previous `filter(isObject)` cast would have silently passed through.

6. **`coerceDecomposition` reuse eliminates code duplication.** The inline decomposition coercion in `coercePersistedState` was replaced with a call to the shared `coerceDecomposition` function, reducing duplication and ensuring consistent validation.

7. **`GenerationProvenance` removal is clean.** No dead code remains in `artifactStore.ts`.

## Summary Table

| #  | Finding | Severity | Location | Confidence | Status |
|----|---------|----------|----------|------------|--------|
| F1 | `storeArtifactResults` reads `existing` outside `setState` callback | Low | page.tsx:337 | Medium | New |
| F2 | `handleRestoreSession` calls `setArtifactGenerated` individually | Low | page.tsx:272-283 | High | New (same pattern as prior F2) |
| F3 | Double `JSON.stringify` in `storeArtifactResults` | Low | page.tsx:309,336 | Medium | Residual (prior F5) |
| F4 | 21 individual selector subscriptions | Informational | page.tsx:84-101 | Medium | Residual (prior F4) |

### Prior findings disposition

| Prior # | Severity | Status | Notes |
|---------|----------|--------|-------|
| F1 (partialize node mapping) | Medium | **Fixed** | `sanitizeDecomposition` memoization is correct |
| F2 (storeArtifactResults batching) | Medium | **Fixed** | Batched into single `setState`; version capping correct |
| F3 (migrateFromV2 batching) | Low | **Fixed** | Single `setState` call |
| F4 (21 selectors) | Low | **Residual** | Comment improved; count unchanged |
| F5 (double JSON.stringify) | Low | **Residual** | Not addressed in this fix cycle |
| F6 (debounced storage single-key) | Informational | **Residual** | No change needed |
| F7 (structuredClone in snapshots) | Informational | **Accepted** | Correct for call frequency |
| F8 (GenerationProvenance unused) | Informational | **Fixed** | Type removed |

## Overall Assessment

The two medium-severity findings from Loop 1 are correctly fixed. The `sanitizeDecomposition` memoization eliminates per-keystroke node mapping waste, and the `storeArtifactResults` batching reduces 5 `set()` calls to 1 on the artifact generation path.

No new medium or high severity issues were introduced by the fixes. The remaining findings are all Low or Informational:

- **F1** (premature `getState()` read) is a fragility, not a current bug. Safe to defer.
- **F2** (`handleRestoreSession` unbatched) is the same pattern that was fixed in `storeArtifactResults`, applied to a lower-frequency code path (user-initiated session restore). Safe to defer.
- **F3** and **F4** are residual from Loop 1 and do not warrant blocking the PR.

**Recommendation:** The PR is ready to merge from a performance perspective. The remaining Low findings are improvement opportunities that can be addressed in a follow-up.
