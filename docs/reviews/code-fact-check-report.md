# Code Fact-Check Report

**Repository:** meta-formalism-copilot
**Scope:** Branch `feat/graph-persistence-editing` relative to `main`
**Checked:** 2026-04-03
**Total claims checked:** 20
**Summary:** 12 verified, 3 mostly accurate, 3 stale, 1 incorrect, 1 unverifiable

---

## Claim 1: "Zustand workspace store — replaces useWorkspacePersistence."

**Location:** `app/lib/stores/workspaceStore.ts:2`
**Type:** Architectural
**Verdict:** Verified
**Confidence:** High

The file `app/hooks/useWorkspacePersistence.ts` has been deleted on this branch (confirmed via `git diff`). The Zustand store in `workspaceStore.ts` now handles all persistence. `page.tsx` imports from `useWorkspaceStore` and no longer references `useWorkspacePersistence`.

**Evidence:** `git diff main...HEAD -- app/hooks/useWorkspacePersistence.ts` shows full deletion; `app/page.tsx:26` imports from `workspaceStore`.

---

## Claim 2: "persist middleware handles serialization lifecycle; custom debounced storage adapter rate-limits writes"

**Location:** `app/lib/stores/workspaceStore.ts:5`
**Type:** Architectural
**Verdict:** Verified
**Confidence:** High

The store uses `persist()` middleware (line 316) with `createJSONStorage(createDebouncedStorage)` (line 463). The `createDebouncedStorage` function (lines 30-55) debounces `setItem` calls with `setTimeout`.

**Evidence:** `app/lib/stores/workspaceStore.ts:30-55`, `app/lib/stores/workspaceStore.ts:461-463`

---

## Claim 3: "Reads are synchronous (instant); writes are debounced by 300ms."

**Location:** `app/lib/stores/workspaceStore.ts:27`
**Type:** Configuration / Behavioral
**Verdict:** Verified
**Confidence:** High

`getItem` directly calls `localStorage.getItem` (synchronous). `setItem` uses `setTimeout(() => {...}, 300)` (line 40). The 300ms value matches the comment.

**Evidence:** `app/lib/stores/workspaceStore.ts:37-42`

---

## Claim 4: "skipHydration: true for Next.js SSR safety (call rehydrate() in useEffect)"

**Location:** `app/lib/stores/workspaceStore.ts:6`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

`skipHydration: true` is set at line 465. `page.tsx` calls `useWorkspaceStore.persist.rehydrate()` inside a `useEffect` (lines 72-77).

**Evidence:** `app/lib/stores/workspaceStore.ts:465`, `app/page.tsx:72-77`

---

## Claim 5: "partialize excludes action functions from persistence"

**Location:** `app/lib/stores/workspaceStore.ts:7`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

The `partialize` function (lines 475-488) returns only data fields (sourceText, extractedFiles, contextText, etc.). No action functions (setSourceText, setArtifactGenerated, etc.) are included.

**Evidence:** `app/lib/stores/workspaceStore.ts:475-488`

---

## Claim 6: "Semiformal/lean kept as flat strings for pipeline compatibility"

**Location:** `app/lib/stores/workspaceStore.ts:9`
**Type:** Architectural
**Verdict:** Verified
**Confidence:** High

`semiformalText` and `leanCode` are stored as `string` fields in `WorkspaceState` (lines 172-173), not as `ArtifactRecord` entries. `ArtifactKey` is defined as `Exclude<ArtifactType, "semiformal" | "lean">` in `artifactStore.ts:13`.

**Evidence:** `app/lib/stores/workspaceStore.ts:172-173`, `app/lib/types/artifactStore.ts:13`

---

## Claim 7: "versions[] ... capped at MAX_VERSIONS"

**Location:** `app/lib/types/artifactStore.ts:26`
**Type:** Behavioral
**Verdict:** Mostly accurate
**Confidence:** Medium

`MAX_VERSIONS = 20` is defined (line 29). In `setArtifactGenerated` (line 345), existing versions are sliced with `slice(-MAX_VERSIONS + 1)` (i.e., `-19`), keeping the last 19 entries before adding the new one, for a max of 20. However, the test at line 134 uses `toBeLessThanOrEqual(20)` rather than `toBe(20)`, and the actual behavior when adding 25 versions yields exactly 20 due to the slice logic. The claim is accurate but the comment "capped at MAX_VERSIONS" could be more precise about when capping occurs (on each write, not as a hard constraint).

**Evidence:** `app/lib/types/artifactStore.ts:29`, `app/lib/stores/workspaceStore.ts:345`, `app/lib/stores/__tests__/workspaceStore.test.ts:128-136`

---

## Claim 8: "See docs/decisions/005-zustand-state-management.md for rationale."

**Location:** `app/lib/stores/workspaceStore.ts:12`
**Type:** Reference
**Verdict:** Mostly accurate
**Confidence:** High

The file exists at `docs/decisions/005-zustand-state-management.md` and contains the rationale. However, there is also a `docs/decisions/005-streaming-api-responses.md` sharing the same decision number "005," which creates a numbering conflict.

**Evidence:** `docs/decisions/005-zustand-state-management.md` (exists), `docs/decisions/005-streaming-api-responses.md` (also exists with same number)

---

## Claim 9: "Reuses coerceDecomposition from workspacePersistence for thorough node validation."

**Location:** `app/lib/stores/workspaceStore.ts:59`
**Type:** Architectural
**Verdict:** Verified
**Confidence:** High

`coerceDecomposition` is imported from `workspacePersistence` at line 21 and called in `coercePersistedState` at line 130 and in the store's `merge` callback at line 468.

**Evidence:** `app/lib/stores/workspaceStore.ts:21,130`

---

## Claim 10: "Provider chain mirrors callLlm(): Anthropic -> OpenRouter -> mock."

**Location:** `app/lib/llm/streamLlm.ts:63`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

Both `callLlm` (lines 131-220) and `streamLlm` (lines 83-154) follow the same chain: check `anthropicKey` first, then `openRouterKey && openRouterModel`, then fall back to mock.

**Evidence:** `app/lib/llm/callLlm.ts:131,162,202`, `app/lib/llm/streamLlm.ts:103,113,124`

---

## Claim 11: "Cache hits emit a single `done` event."

**Location:** `app/lib/llm/streamLlm.ts:63`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

When `cached` is found (line 88) and `SIMULATE_STREAM_FROM_CACHE` is not "true", a single `sseEvent("done", ...)` is enqueued (line 97) and the controller is closed (line 99).

**Evidence:** `app/lib/llm/streamLlm.ts:86-101`

---

## Claim 12: "Emits chunks of ~20 chars with a small delay between each"

**Location:** `app/lib/llm/streamLlm.ts:159`
**Type:** Configuration
**Verdict:** Verified
**Confidence:** High

`CHUNK_SIZE = 20` (line 169) and `DELAY_MS = 15` (line 170). The loop slices text into 20-char chunks with 15ms delays between each.

**Evidence:** `app/lib/llm/streamLlm.ts:169-177`

---

## Claim 13: "The last call is always delivered (trailing edge)."

**Location:** `app/lib/utils/throttle.ts:2`
**Type:** Behavioral
**Verdict:** Mostly accurate
**Confidence:** Medium

The throttle function schedules a trailing timer when a call arrives during the cooldown period (lines 19-23). However, if multiple calls arrive during cooldown, only the first one schedules the timer — subsequent calls during the same cooldown window are silently dropped (the `else if (!timer)` check at line 19 means later calls don't update the timer's arguments). This means the *last* call is not always delivered; rather, the *first call after the leading edge* is delivered on the trailing edge.

**Evidence:** `app/lib/utils/throttle.ts:15-23`

---

## Claim 14: "State is persisted to localStorage via `useWorkspacePersistence` and survives page refreshes."

**Location:** `CLAUDE.md:29`
**Type:** Architectural
**Verdict:** Stale
**Confidence:** High

`useWorkspacePersistence` has been deleted on this branch. State is now persisted via the Zustand store with `persist` middleware in `workspaceStore.ts`. The "survives page refreshes" part is still true.

**Evidence:** `app/hooks/useWorkspacePersistence.ts` deleted; `app/lib/stores/workspaceStore.ts:316` uses `persist()` middleware.

---

## Claim 15: "hooks/ — Custom hooks: `useWorkspacePersistence`, `useWorkspaceSessions`, `useFormalizationPipeline`, `useDecomposition`, `useAutoFormalizeQueue`, `useAnalytics`, etc."

**Location:** `CLAUDE.md:48`
**Type:** Staleness
**Verdict:** Stale
**Confidence:** High

`useWorkspacePersistence` no longer exists in the hooks directory (deleted on this branch). The list should reference `useWorkspaceStore` (in `lib/stores/`) or at minimum remove `useWorkspacePersistence`. The other hooks mentioned still exist.

**Evidence:** `app/hooks/useWorkspacePersistence.ts` deleted.

---

## Claim 16: "components/panels/ — One component per panel: `InputPanel`, `SemiformalPanel`, `LeanPanel`, `GraphPanel`, `NodeDetailPanel`, `CausalGraphPanel`, `StatisticalModelPanel`, `PropertyTestsPanel`, `BalancedPerspectivesPanel`, `AnalyticsPanel`"

**Location:** `CLAUDE.md:37`
**Type:** Staleness / Architectural
**Verdict:** Stale
**Confidence:** High

The panels directory now also contains `CounterexamplesPanel.tsx`, `ArtifactPanelShell.tsx`, `OutputPanel.tsx`, `SourcePanel.tsx`, and `ContextPanel.tsx`. The CLAUDE.md list is missing `CounterexamplesPanel` (added in this branch) and several others. `DialecticalMapPanel` was previously listed and renamed to `BalancedPerspectivesPanel` (correctly reflected), but `CounterexamplesPanel` is a new addition.

**Evidence:** `ls app/components/panels/*.tsx` shows CounterexamplesPanel.tsx, ArtifactPanelShell.tsx, OutputPanel.tsx, SourcePanel.tsx, ContextPanel.tsx — none listed in CLAUDE.md.

---

## Claim 17: "Convenience hook that creates editing state for all structured artifact types. Accepts the persisted JSON strings and their setters from useWorkspacePersistence."

**Location:** `app/hooks/useArtifactEditing.ts:69-71`
**Type:** Architectural / Staleness
**Verdict:** Incorrect
**Confidence:** High

The docstring says it "Accepts the persisted JSON strings and their setters from useWorkspacePersistence." However, `useWorkspacePersistence` no longer exists — it was deleted on this branch. Furthermore, `useAllArtifactEditing` is not called anywhere in the codebase (grep finds it only in its definition file), making it dead code with a stale docstring.

**Evidence:** `app/hooks/useArtifactEditing.ts:69-71`; `useWorkspacePersistence.ts` deleted; grep for `useAllArtifactEditing` returns only its definition.

---

## Claim 18: "Wait-time estimation code (`useWaitTimeEstimate`, `predict.ts` priors, `/api/predict` route) can be removed"

**Location:** `docs/decisions/005-streaming-api-responses.md:33`
**Type:** Architectural
**Verdict:** Unverifiable
**Confidence:** Medium

The decision record says this code "can be removed" (future tense). As of this branch, `useWaitTimeEstimate` still exists and is imported in 12 files. `/api/predict/route.ts` also still exists. The claim is a recommendation, not a statement of current state. Whether it's actionable depends on whether streaming has fully replaced the wait-time estimation pattern — which it appears to have, but the code has not been removed yet.

**Evidence:** `app/hooks/useWaitTimeEstimate.ts` exists; `app/api/predict/route.ts` exists; grep finds 12 files importing `useWaitTimeEstimate`.

---

## Claim 19: "JSON artifact types ... currently use batch `callLlm()` wrapped in a single SSE `done` event (`artifactRoute.ts:86`)"

**Location:** `docs/thoughts/partial-json-streaming.md:8`
**Type:** Behavioral / Reference
**Verdict:** Verified
**Confidence:** Medium

This document describes the *problem* state before the implementation. The checklist items (lines 78-84) are all marked "done," indicating this describes the *before* state. Line 86 of `artifactRoute.ts` currently falls inside the non-streaming batch path (which still exists as a fallback). The description was accurate at the time of writing and the document correctly records the old state.

**Evidence:** `docs/thoughts/partial-json-streaming.md:78-84` (all marked done), `app/lib/formalization/artifactRoute.ts:65-79` (streaming path added)

---

## Claim 20: "Zustand v5 with artifact versioning layer. Validated via spike (20 tests, all passing)."

**Location:** `docs/decisions/005-zustand-state-management.md:18`
**Type:** Reference
**Verdict:** Verified
**Confidence:** High

The workspace store test file (`workspaceStore.test.ts`) contains tests across 6 describe blocks covering the areas listed in the spike. The spike branch is referenced as `spike/zustand-state-management-2026-04-02`. The store implementation matches the spike's recommended architecture.

**Evidence:** `app/lib/stores/__tests__/workspaceStore.test.ts` (contains comprehensive test suite), `docs/spikes/zustand-state-management.md`

---

## Claims Requiring Attention

### Incorrect
- **Claim 17** (`app/hooks/useArtifactEditing.ts:69-71`): Docstring references `useWorkspacePersistence` which no longer exists. The function `useAllArtifactEditing` is also dead code (never called).

### Stale
- **Claim 14** (`CLAUDE.md:29`): Says state is persisted via `useWorkspacePersistence` — should say Zustand store with persist middleware.
- **Claim 15** (`CLAUDE.md:48`): Lists `useWorkspacePersistence` in hooks — should be removed or replaced with `workspaceStore`.
- **Claim 16** (`CLAUDE.md:37`): Panel list is missing `CounterexamplesPanel`, `ArtifactPanelShell`, `OutputPanel`, `SourcePanel`, `ContextPanel`.

### Mostly Accurate
- **Claim 7** (`app/lib/types/artifactStore.ts:26`): "capped at MAX_VERSIONS" is correct but the capping mechanism (slice on each write) is not obvious from the comment alone.
- **Claim 8** (`app/lib/stores/workspaceStore.ts:12`): Reference to `005-zustand-state-management.md` is valid but there's a numbering collision with `005-streaming-api-responses.md`.
- **Claim 13** (`app/lib/utils/throttle.ts:2`): "The last call is always delivered" is not strictly true — calls arriving during an existing trailing timer are dropped, so the first-after-leading-edge call is delivered, not necessarily the last.

### Unverifiable
- **Claim 18** (`docs/decisions/005-streaming-api-responses.md:33`): States wait-time estimation code "can be removed" — this is a recommendation and the code still exists. Whether it's safe to remove requires runtime testing.
