# Security Code Review: feat/zustand-wire-page (Loop 2)

**Branch:** `feat/zustand-wire-page` relative to `main`
**Scope:** 20 files changed -- workspaceStore.ts, page.tsx, artifactStore.ts, workspacePersistence.ts, tests, package.json, docs
**Reviewer:** Claude Opus 4.6 (security review)
**Date:** 2026-04-03
**Loop:** 2 (prior loop found 5 findings; fixes applied in commit 3ed18f8)

## Trust Boundary Map

This diff is entirely client-side. The trust boundaries are:

1. **localStorage -> Zustand store (rehydration)**: Data read from `workspace-zustand-v1` localStorage key is untrusted (modifiable by browser extensions, XSS payloads, or manual editing). Zustand's `persist` middleware deserializes it via `JSON.parse`, then the custom `merge` function passes it through `coercePersistedState()` before it reaches the store.

2. **Old workspace-v2 localStorage -> Zustand store (migration)**: `migrateFromV2()` reads the old `workspace-v2` key via `loadWorkspace()`, which performs its own defensive coercion (including the now-shared `coerceDecomposition`), then writes into the store via a single `setState()` call.

3. **Zustand store -> localStorage (persistence)**: The `partialize` function controls what is written. It sanitizes `verificationStatus` and node statuses before serialization, with memoization via `sanitizeDecomposition` to avoid redundant node mapping. The debounced storage adapter wraps `setItem` in a try/catch for quota errors.

4. **Snapshot/restore boundary**: `getSnapshot()` produces a deep copy via `structuredClone`. `resetToSnapshot()` receives a `WorkspaceState` and applies it via `set({ ...data })`. Callers in `page.tsx` sanitize `verificationStatus` before calling, but the store method itself does not.

5. **Zustand store -> React components**: Same client-side JS context; no trust transition. Components read via selectors and write via setters.

No server-side code, API routes, authentication, or cryptographic operations are changed in this diff. The `ANTHROPIC_API_KEY` is not touched.

## Fix Verification (from Loop 1)

### A1 (ArtifactVersion field validation) -- FIXED, VERIFIED CORRECT

**Commit:** 3ed18f8
**What was done:** Added `coerceArtifactVersion()` function that validates each field of an `ArtifactVersion` individually: `id` must be a string (rejects if not), `content` must be a string (rejects if not), `createdAt` falls back to `new Date().toISOString()`, `source` is validated against a `VALID_ARTIFACT_SOURCES` Set (falls back to `"generated"`), and `editInstruction` is accepted only if it is a string. `coerceArtifactRecord` now maps through `coerceArtifactVersion` and filters nulls instead of just checking `isObject`.

**Assessment:** The fix is correct and complete. It closes the deserialization gap identified in Loop 1 Finding 1. The approach is consistent with how other fields in `coercePersistedState` are validated (typeof checks with safe defaults or rejection). The `VALID_ARTIFACT_SOURCES` Set prevents injection of unexpected source values. No new issues introduced.

### A4 (GenerationProvenance removal) -- FIXED, VERIFIED CORRECT

**Commit:** 3ed18f8
**What was done:** Removed the unused `GenerationProvenance` type from `app/lib/types/artifactStore.ts`.

**Assessment:** Clean removal. The type was dead code with a misleading comment. No references existed, so no downstream breakage.

### A2 (Node coercion reuse) -- FIXED, VERIFIED CORRECT

**Commit:** 3ed18f8
**What was done:** The inline decomposition coercion in `coercePersistedState()` was replaced with a call to the existing `coerceDecomposition()` function from `workspacePersistence.ts` (which was made `export`). The inline version had used `isObject` filtering with a spread-and-cast pattern that did not validate individual node fields. The shared `coerceDecomposition()` validates every field of each `PropositionNode` individually (id, label, kind, statement, proofText, dependsOn, sourceId, sourceLabel, etc.).

**Assessment:** This is a meaningful security improvement. The prior inline version could pass through nodes with non-string fields (e.g., `id: 42` or `statement: null`) because it only checked `isObject` at the node level. The shared function validates each field with typeof checks and safe defaults. Single source of truth eliminates drift risk between the two code paths.

## Findings

### 1. resetToSnapshot applies data without internal sanitization

**Severity:** Low
**Location:** `app/lib/stores/workspaceStore.ts` line 406 (`resetToSnapshot: (data) => set({ ...data })`)
**Move:** Find the implicit sanitization assumption
**Confidence:** Low

This finding persists from Loop 1 (was Finding 2). `resetToSnapshot` spreads the provided `WorkspaceState` directly into the store with no validation. Currently, the only caller (`page.tsx:resetWorkspaceToSnapshot`) sanitizes `verificationStatus` via `sanitizeVerificationStatus()` before calling. However, the store's public API does not enforce this -- a future caller could pass unsanitized data (e.g., `verificationStatus: "verifying"` from a stale session snapshot), leaving the app in a stuck loading state.

The `partialize` function would sanitize the value before it reaches localStorage, so this would only affect the in-memory state until the next page load. The blast radius is limited to the current session.

**Recommendation:** Move sanitization into the store's `resetToSnapshot` method as defense-in-depth.

### 2. Non-atomic migration check (TOCTOU)

**Severity:** Informational
**Location:** `app/lib/stores/workspaceStore.ts` lines 478-493 (`onRehydrateStorage`)
**Move:** Identify time-of-check to time-of-use gaps
**Confidence:** Low

Persists from Loop 1 (was Finding 4). The rehydration callback checks for `workspace-v2` and `workspace-zustand-v1` keys, parses the Zustand key, then conditionally runs `migrateFromV2()`. This is not atomic. In practice this is benign: migration is effectively idempotent, and this is a single-user client app. The `catch` block correctly falls through to migration if the Zustand key is corrupted.

**Recommendation:** No action needed.

### 3. Debounced write can lose data on tab close

**Severity:** Low
**Location:** `app/lib/stores/workspaceStore.ts` lines 38-47 (`createDebouncedStorage.setItem`)
**Move:** Check the error path, not just the happy path
**Confidence:** Medium

Persists from Loop 1 (was Finding 5). The debounced storage adapter delays `localStorage.setItem` by 300ms. If the user closes the tab during the debounce window, the pending write is lost. This is a known tradeoff documented in the spike.

**Recommendation:** Consider adding a `beforeunload` listener that flushes the pending debounced write synchronously. This is a robustness improvement, not a security fix.

### 4. Batch artifact update in page.tsx duplicates store logic

**Severity:** Informational
**Location:** `app/page.tsx` lines 329-348 (inside `handleAllResults` callback)
**Move:** Trace the trust boundaries
**Confidence:** Medium

The `handleAllResults` callback in `page.tsx` manually constructs `ArtifactRecord` objects with version slicing logic (`existing.versions.slice(-MAX_VERSIONS + 1)`) that duplicates the logic inside `setArtifactGenerated`. This was done for batching (single `setState` call instead of N separate calls). While the logic is currently correct and identical to the store's version, having two copies means a future change to the versioning cap or truncation strategy could be applied to one but not the other.

This is not a security vulnerability. It is noted because divergent logic in the persistence path could lead to unexpected state if the two implementations drift.

**Recommendation:** Consider extracting the version-building logic into a shared helper (e.g., `buildUpdatedVersions(existing, newContent, source)`) that both the store action and the page callback use.

## What Looks Good

- **Complete deserialization validation chain.** After the A1 fix, every field at every nesting level of persisted data is type-checked before entering the store: top-level scalars in `coercePersistedState`, artifact records via `coerceArtifactRecord`, individual versions via `coerceArtifactVersion`, and decomposition nodes via the shared `coerceDecomposition`. This is thorough.

- **Single source of truth for decomposition coercion.** The A2 fix eliminated the duplicated inline coercion and now both the v2 migration path (`loadWorkspace`) and the Zustand rehydration path (`coercePersistedState`) use the same `coerceDecomposition()` function. This prevents drift.

- **Quota error handling in debounced storage.** `localStorage.setItem` is wrapped in try/catch with a console.warn on quota exceeded.

- **`partialize` sanitizes transient states on write.** `verificationStatus: "verifying"` is stripped to `"none"` before persistence. Node verification statuses are sanitized via the memoized `sanitizeDecomposition`.

- **`getSnapshot` uses `structuredClone` for deep copy.** Prevents mutation of the snapshot from affecting the live store. `extractedFiles` correctly strips non-serializable `File` references.

- **SSR hydration handled correctly.** `skipHydration: true` with `rehydrate()` in a client-side `useEffect` avoids Next.js hydration mismatches.

- **No secrets in the diff.** The `ANTHROPIC_API_KEY` is not touched. No credentials, tokens, or sensitive data flow through the changed code.

- **`currentVersionIndex` bounds-checked on both read and write paths.** `coerceArtifactRecord` clamps the index; `undoArtifact`/`redoArtifact` guard against out-of-bounds; `resolveArtifactContent` uses optional chaining with `?? null`.

- **Artifact version cap (MAX_VERSIONS = 20) prevents unbounded growth.** Both `setArtifactGenerated` and `setArtifactEdited` trim to the cap.

- **All 174 tests pass.** Including hydration and migration tests that exercise the deserialization paths.

## Summary Table

| # | Finding | Severity | Status | Location | Confidence |
|---|---------|----------|--------|----------|------------|
| A1 | ArtifactVersion inner fields not validated | Low | FIXED (3ed18f8) | workspaceStore.ts | -- |
| A2 | Decomposition coercion duplicated inline | Low | FIXED (3ed18f8) | workspaceStore.ts | -- |
| A4 | Unused GenerationProvenance type | Informational | FIXED (3ed18f8) | artifactStore.ts | -- |
| 1 | resetToSnapshot accepts unsanitized data | Low | Open (unchanged) | workspaceStore.ts:406 | Low |
| 2 | Non-atomic migration check (TOCTOU) | Informational | Open (accepted) | workspaceStore.ts:478-493 | Low |
| 3 | Debounced write can lose data on tab close | Low | Open (accepted) | workspaceStore.ts:38-47 | Medium |
| 4 | Batch artifact update duplicates store logic | Informational | NEW | page.tsx:329-348 | Medium |

## Overall Assessment

The three fixes from Loop 1 are correct and complete. The `coerceArtifactVersion` function (A1) closes the last gap in the deserialization validation chain. The `coerceDecomposition` reuse (A2) eliminates duplicated logic and ensures consistent node-level validation across both the v2 migration and Zustand rehydration paths. The `GenerationProvenance` removal (A4) is clean dead-code removal.

No new security vulnerabilities were introduced by the fixes. The one new finding (Finding 4, Informational) is a maintainability concern about duplicated version-building logic in `page.tsx`, not a security issue.

The two remaining Low findings (resetToSnapshot sanitization, debounced write data loss) and the Informational TOCTOU are acceptable for a single-user client-side application. None represent exploitable vulnerabilities in the current threat model.

No Critical or High severity issues found. The branch is ready to merge from a security perspective.
