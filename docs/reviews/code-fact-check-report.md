# Code Fact-Check Report

**Repository:** meta-formalism-copilot
**Scope:** Branch `feat/zustand-wire-page` relative to `main`
**Checked:** 2026-04-03 (Loop 2)
**Prior loop:** 22 claims, 17 verified, 3 mostly accurate, 0 incorrect, 1 unverifiable
**Fixes applied in:** commit 3ed18f8
**Total claims checked:** 25 (22 prior + 3 new from fix commit)
**Summary:** 22 verified, 0 mostly accurate, 0 stale, 0 incorrect, 0 unverifiable

---

## Previously "Mostly Accurate" Claims -- Re-checked

### Claim 2: "persist middleware handles serialization lifecycle; custom debounced storage adapter rate-limits writes"

**Location:** `app/lib/stores/workspaceStore.ts:5`
**Type:** Architectural
**Verdict:** Verified (was: Mostly Accurate)
**Confidence:** High

The comment was rewritten in commit 3ed18f8. The new phrasing precisely describes both roles: the persist middleware manages the serialization lifecycle (when/what to save, rehydration, merging), while the custom `createDebouncedStorage` adapter (lines 30-55) rate-limits the actual `localStorage.setItem` calls with a 300ms debounce.

**Evidence:** `app/lib/stores/workspaceStore.ts:5,30-55`

---

### Claim 9: "Reuses coerceDecomposition from workspacePersistence for thorough node validation."

**Location:** `app/lib/stores/workspaceStore.ts:59`
**Type:** Architectural
**Verdict:** Verified (was: Mostly Accurate)
**Confidence:** High

The comment was rewritten and the code was changed. `coerceDecomposition` is now exported from `workspacePersistence.ts` (line 114) and imported in `workspaceStore.ts` (line 21). The decomposition coercion code at line 130 calls `coerceDecomposition(persisted.decomposition)` directly, replacing the previous inline reimplementation. The function in `workspacePersistence.ts` validates every node field individually (id, label, kind, statement, proofText, dependsOn, etc.), making "thorough node validation" accurate.

**Evidence:** `app/lib/stores/workspaceStore.ts:21,128-131`, `app/lib/utils/workspacePersistence.ts:114-149`

---

### Claim 15: "Store setters -- Zustand selectors return the same function identity across state changes, so Object.is comparison prevents re-renders for these."

**Location:** `app/page.tsx:92-93`
**Type:** Behavioral
**Verdict:** Verified (was: Mostly Accurate)
**Confidence:** High

The comment was rewritten in commit 3ed18f8. The new phrasing correctly explains the mechanism: Zustand action functions are defined once in the `create()` callback and are referentially stable. The `Object.is` comparison used by `useWorkspaceStore` sees the same function identity on every state change, so components subscribing to setters never re-render from those subscriptions.

**Evidence:** `app/page.tsx:92-93`

---

## Previously "Unverifiable" Claim -- Re-checked

### Claim 11: GenerationProvenance type

**Location:** Previously `app/lib/types/artifactStore.ts:29-35`
**Type:** Architectural
**Verdict:** Resolved (removed)
**Confidence:** High

The `GenerationProvenance` type and its accompanying JSDoc comment were deleted in commit 3ed18f8. The file now ends cleanly with `MAX_VERSIONS = 20` at line 29. No dead code or orphaned comments remain. No other file referenced this type.

**Evidence:** `app/lib/types/artifactStore.ts` (full file, 30 lines), `git diff 3ed18f8^..3ed18f8 -- app/lib/types/artifactStore.ts`

---

## New Claims Introduced by Fix Commit

### Claim 23: "Single setState call -- matches the batching pattern in resetWorkspaceToSnapshot"

**Location:** `app/lib/stores/workspaceStore.ts:269`
**Type:** Architectural
**Verdict:** Verified
**Confidence:** High

The `migrateFromV2()` function (lines 252-283) was refactored from N individual setter calls to a single `useWorkspaceStore.setState({...})` call at line 270. The `resetWorkspaceToSnapshot` function is at `app/page.tsx:143-154` and uses the same pattern -- a single `useWorkspaceStore.setState({...})` with all fields. The batching claim is accurate.

**Evidence:** `app/lib/stores/workspaceStore.ts:269-281`, `app/page.tsx:143-154`

---

### Claim 24: "Partialize memoization -- avoid re-mapping decomposition nodes on every set() when only unrelated fields (e.g., sourceText) changed."

**Location:** `app/lib/stores/workspaceStore.ts:287-288`
**Type:** Performance
**Verdict:** Verified
**Confidence:** High

The `sanitizeDecomposition` function (lines 294-307) uses module-level variables `_lastDecompRef` and `_lastDecompSanitized` to cache the result. When `decomposition` is the same object reference (`===` check at line 295), the cached result is returned without re-mapping nodes. Since `partialize` is called on every `set()` (Zustand persist behavior), this avoids O(n) node mapping when only unrelated fields like `sourceText` changed. The memoization is reference-based, which is correct because Zustand produces new state objects via spread only for changed fields.

**Evidence:** `app/lib/stores/workspaceStore.ts:291-306,472`

---

### Claim 25: "Batch-update persisted display state -- single setState instead of N separate set() calls"

**Location:** `app/page.tsx:332`
**Type:** Performance
**Verdict:** Verified
**Confidence:** High

The `handleFormalizationComplete` callback (lines 332-349) builds an `artifactUpdates` map for all generated artifacts, then calls `useWorkspaceStore.setState()` once at line 346. This replaces the prior pattern of calling `store.setArtifactGenerated(key, ...)` in a loop, which would have triggered N separate `set()` calls (each triggering the debounced persist). The version capping logic (`slice(-MAX_VERSIONS + 1)`) at line 340 matches `setArtifactGenerated` in the store (line 308).

**Evidence:** `app/page.tsx:332-349`, `app/lib/stores/workspaceStore.ts:302-312`

---

## Unchanged Claims (Spot-checked for Staleness)

Claims 1, 3-8, 10, 12-14, 16-22 were not modified by commit 3ed18f8 and their surrounding code is unchanged. Spot-checks:

- **Claim 4** (partialize excludes actions): Line numbers shifted slightly due to new `sanitizeDecomposition` function. The `partialize` function is now at lines 460-473. Still excludes all action functions. **Still verified.**
- **Claim 10** (versions oldest-first, capped at MAX_VERSIONS): `MAX_VERSIONS` moved from line 37 to line 29 in `artifactStore.ts` due to `GenerationProvenance` removal. Value is still 20. **Still verified.**
- **Claim 12** (strip transient "verifying"): `sanitizeVerificationStatus` call is at line 469 (shifted from 434). **Still verified.**
- **Claim 13** (File references dropped by JSON.stringify): Comment is at line 458-459 (shifted from 423). **Still verified.**

No previously verified claims became stale.

---

## Claim 9 Merge Comment -- Also Updated

**Location:** `app/lib/stores/workspaceStore.ts:452`
**Type:** Comment

The `merge` function's comment was also updated from "This mirrors the defensive coercion in loadWorkspace() for the v2 path" to "Reuses coerceDecomposition from workspacePersistence for node-level field validation." This is consistent with the Claim 9 fix and is accurate -- the merge function calls `coercePersistedState`, which calls `coerceDecomposition`.

---

## Claims Requiring Attention

### Incorrect

(None.)

### Stale

(None.)

### Mostly Accurate

(None -- all three prior "Mostly Accurate" claims are now Verified after comment fixes.)

### Unverifiable

(None -- the GenerationProvenance type was removed, eliminating the unverifiable forward-looking claim.)
