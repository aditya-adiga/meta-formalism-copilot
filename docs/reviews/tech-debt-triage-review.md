# Tech Debt Triage Review: feat/graph-persistence-editing vs main

**Branch:** `feat/graph-persistence-editing` (86 files changed, ~8K lines vs main)
**Reviewed:** 2026-04-03
**Scope:** Full branch diff. This is an integration branch merging multiple feature branches: Zustand state management, streaming API, artifact editing, onboarding overlay, dialectical-map rename, UI visibility improvements, and dependency updates.

---

## Tech Debt Triage: Duplicated `recordAndCache` between `callLlm.ts` and `streamLlm.ts`

**Location:** `app/lib/llm/callLlm.ts` (line 77), `app/lib/llm/streamLlm.ts` (line 35)
**Nature:** structural

### Carrying Cost: Medium
The two implementations have slightly different signatures (callLlm's version takes a `cacheKey` parameter and returns a `CallLlmResult`; streamLlm's version takes only the hash and returns void). Both perform the same analytics-write + cache-write pattern. If the analytics entry shape changes, the caching strategy changes, or error handling needs adjustment, both must be updated. The comment in `streamLlm.ts` ("same as callLlm's recordAndCache") acknowledges the duplication explicitly, which means a future developer will know to check both, but it is still a maintenance risk.

### Fix Cost
- **Scope:** localized (two files in the same directory)
- **Effort:** hours
- **Risk:** low
- **Incremental?** yes

### Urgency Triggers
- Adding a third LLM calling pattern (e.g., batch, tool-use)
- Changing analytics schema or cache format

### Recommendation: Fix opportunistically
Extract a shared `recordAndCache` into a common module (e.g., `app/lib/llm/analytics.ts`). The signatures differ slightly, so the shared version would need to be parameterized, but the core logic is identical. Worth doing next time either file is touched.

---

## Tech Debt Triage: `page.tsx` remains a ~860-line monolithic orchestrator

**Location:** `app/page.tsx`
**Nature:** structural

### Carrying Cost: High
The root `page.tsx` is the single largest file in the app (860 lines). It manages: panel navigation, Zustand store subscriptions (39 `useWorkspaceStore` calls), decomposition state bridging, formalization pipeline wiring, session management, artifact generation callbacks, export handlers, and panel rendering. The Zustand migration improved things (removed ~40 lines of ref-juggling) but added new bridging code for `PersistedWorkspace` snapshots (~60 lines). Any new artifact type requires touching at least 5 sections of this file. Cognitive load for contributors is high; merge conflicts are likely if multiple features touch state wiring simultaneously.

### Fix Cost
- **Scope:** cross-cutting (would need to design sub-orchestrators or context providers)
- **Effort:** days
- **Risk:** medium (risk of introducing subtle re-render regressions)
- **Incremental?** yes (can extract one concern at a time)

### Urgency Triggers
- Adding more artifact types (each adds ~20 lines across multiple sections)
- Multiple contributors working on state-related features concurrently
- Performance profiling reveals unnecessary re-renders from the flat subscription pattern

### Recommendation: Defer and monitor
The file is large but well-organized with clear sections. The Zustand migration actually makes future extraction easier since store access can move to child components without prop drilling. Wait until a concrete pain point (merge conflict, performance issue, or 7+ artifact types) before refactoring. When the time comes, the natural extraction boundaries are: (1) artifact state bridging into a custom hook, (2) formalization pipeline callbacks into a hook, (3) panel rendering into a separate component.

---

## Tech Debt Triage: `PersistedWorkspace` bridge layer between Zustand store and workspace sessions

**Location:** `app/page.tsx` (lines 107-161), `app/lib/stores/workspaceStore.ts` (lines 237-276)
**Nature:** structural

### Carrying Cost: Medium
The workspace sessions system (`useWorkspaceSessions`) still speaks `PersistedWorkspace` -- the old flat-field format where artifacts are `string | null`. The Zustand store uses `ArtifactRecord` with version history. Every session save/restore round-trips through conversion code in `page.tsx` (`getWorkspaceSnapshot` maps store to PersistedWorkspace; `resetWorkspaceToSnapshot` maps PersistedWorkspace back to store with single-version ArtifactRecords). This means session restore discards version history (acknowledged as item #6 in the prior review). The `PERSISTED_ARTIFACT_FIELDS` mapping and `makeVersion` are imported from the store into `page.tsx`, creating a conceptual coupling between store internals and the page orchestrator.

### Fix Cost
- **Scope:** cross-cutting (touches workspace sessions, page.tsx, store, persistence types)
- **Effort:** days
- **Risk:** medium (session data format is persisted in localStorage; migration needed)
- **Incremental?** partially (could update the session format first, then remove bridging code)

### Urgency Triggers
- Users rely on undo/redo and expect it to survive session switches
- Adding more fields to `ArtifactRecord` (e.g., metadata, tags)

### Recommendation: Fix opportunistically
The version history loss on session switch is currently acceptable because the feature is new and users have not yet built workflows around undo/redo persistence. When workspace sessions are next touched, update `WorkspaceSession.workspace` to store `WorkspaceState` directly instead of `PersistedWorkspace`, which would eliminate the bridge layer entirely.

---

## Tech Debt Triage: Unused `useAllArtifactEditing` hook

**Location:** `app/hooks/useArtifactEditing.ts` (lines 70-115)
**Nature:** structural (dead code)

### Carrying Cost: Low
The `useAllArtifactEditing` convenience hook is exported but has zero callers. Its docstring references `useWorkspacePersistence` (the deleted hook), suggesting it was written for an earlier integration plan that was superseded. It takes `string | null` + setter pairs as arguments, which does not match how `page.tsx` actually manages artifact state (via Zustand selectors). The individual `useArtifactEditing` hook is used, but this aggregate wrapper is not.

### Fix Cost
- **Scope:** localized (single file, single function)
- **Effort:** minutes
- **Risk:** low
- **Incremental?** yes

### Urgency Triggers
- None (dead code has zero runtime impact)

### Recommendation: Fix now
Delete `useAllArtifactEditing` and the stale docstring. It is ~45 lines of dead code with an outdated API surface that could mislead future developers.

---

## Tech Debt Triage: Streaming/non-streaming API duality for artifact generation

**Location:** `app/lib/formalization/api.ts`, `app/hooks/useArtifactGeneration.ts`, `app/lib/formalization/formalizeNode.ts`
**Nature:** structural

### Carrying Cost: Medium
The branch adds streaming variants (`generateSemiformalStreaming`, `generateLeanStreaming`, `fetchStreamingApi`) alongside the existing non-streaming versions (`generateSemiformal`, `generateLean`, `fetchApi`). The global pipeline and artifact generation hook use streaming; the auto-formalize queue (`formalizeNode.ts`) still uses non-streaming `fetchApi`. This means there are two code paths for the same LLM calls, with different error handling, response parsing, and progress reporting. The non-streaming path lacks the partial-JSON preview feature and the throttled callback pattern. If API routes change their response format, both paths must be updated.

### Fix Cost
- **Scope:** cross-cutting (api.ts, formalizeNode.ts, useAutoFormalizeQueue.ts, multiple API routes)
- **Effort:** days
- **Risk:** medium (formalizeNode runs in the auto-queue which has its own concurrency/cancel logic)
- **Incremental?** yes (can migrate one call site at a time)

### Urgency Triggers
- Removing the `stream: true` conditional from API routes (simplification)
- Users noticing that decomposed-node formalization has no progress feedback

### Recommendation: Carry intentionally
The non-streaming path in `formalizeNode` is functional and well-tested. Migrating it to streaming requires handling the interaction between SSE parsing and the cancel-signal mechanism in `useAutoFormalizeQueue`. This is worth doing eventually (users would benefit from progress feedback during auto-formalization), but it is not blocking anything today.

---

## Tech Debt Triage: Incomplete rename from "dialectical-map" to "balanced-perspectives"

**Location:** `app/components/features/onboarding/OnboardingOverlay.tsx` (line 79), `app/api/formalization/balanced-perspectives/route.ts` (lines 5, 34)
**Nature:** naming

### Carrying Cost: Low
The rename from "dialectical map" to "balanced perspectives" is ~95% complete across the codebase. Two residual references remain: (1) the onboarding overlay still says "Dialectical Map" in the artifact type grid, and (2) the API route's system prompt still says "dialectical analyst" and "dialectical landscape". The persistence layer (`workspacePersistence.ts` line 215) correctly handles the old field name as a migration fallback, which is appropriate. These are cosmetic inconsistencies that users might notice in the onboarding overlay.

### Fix Cost
- **Scope:** localized (two files, string literals only)
- **Effort:** minutes
- **Risk:** low
- **Incremental?** yes

### Urgency Triggers
- User-facing inconsistency in onboarding text

### Recommendation: Fix now
Update the onboarding overlay text and the system prompt strings. This is a two-line fix with no architectural impact.

---

## Tech Debt Triage: Dual localStorage keys (`workspace-v2` + `workspace-zustand-v1`)

**Location:** `app/lib/stores/workspaceStore.ts` (lines 474-490)
**Nature:** structural

### Carrying Cost: Medium
The `onRehydrateStorage` callback checks for `workspace-v2` on every app load to decide whether to run migration. It never cleans up the old key after successful migration. This means: (1) the migration check runs on every load indefinitely, (2) stale data in `workspace-v2` occupies localStorage quota, and (3) if a bug in the Zustand store causes data loss, the app might silently re-migrate stale v2 data, which would be confusing.

### Fix Cost
- **Scope:** localized (single file)
- **Effort:** hours
- **Risk:** low (add `localStorage.removeItem(WORKSPACE_KEY)` after successful migration)
- **Incremental?** yes

### Urgency Triggers
- Users with large workspaces hitting localStorage quota
- A long enough time passes that the old format is no longer worth supporting

### Recommendation: Fix opportunistically
Add cleanup of the old key after successful migration. Optionally add a version timestamp so the migration path can be removed entirely after a release cycle.

---

## Tech Debt Triage: `EditableSection` makes direct API calls from a UI component

**Location:** `app/components/features/output-editing/EditableSection.tsx` (lines 77-88)
**Nature:** structural

### Carrying Cost: Low
`EditableSection` imports `fetchApi` and makes HTTP calls directly (`/api/edit/whole` for strings, `/api/edit/artifact` for JSON objects) in its `handleAiEdit` callback. The `useArtifactEditing` hook exists for exactly this purpose but `EditableSection` does not use it. This violates the app's pattern where components receive callbacks from hooks rather than making API calls directly. It also means there is no loading state visible to the parent, no wait-time estimation, and no way to cancel an in-flight section edit.

### Fix Cost
- **Scope:** localized (one component + one hook)
- **Effort:** hours
- **Risk:** low
- **Incremental?** yes

### Urgency Triggers
- Users request cancel support for section edits
- Need to add analytics tracking for section-level AI edits

### Recommendation: Fix opportunistically
Lift the API call into a callback passed from the parent (consistent with `onAiEdit` for whole-document edits on `ArtifactPanelShell`). This would also enable the parent to track loading state for section edits.

---

## Tech Debt Triage: `useFieldUpdaters` uses `any` casts and untyped dynamic key access

**Location:** `app/hooks/useFieldUpdaters.ts` (lines 15, 22)
**Nature:** typing

### Carrying Cost: Low
The `updateField` and `updateArrayItem` functions use `(data as any)[key]` for dynamic key access, with eslint-disable comments. This is a pragmatic choice for a generic hook, but it means TypeScript cannot verify that the key exists on the data object or that the value type is correct. A typo in a key string would not be caught at compile time.

### Fix Cost
- **Scope:** localized (single file)
- **Effort:** hours (would need generics with keyof constraints)
- **Risk:** low
- **Incremental?** yes

### Urgency Triggers
- None (the hook is called from ~5 panels with well-known schemas; bugs would be caught quickly in manual testing)

### Recommendation: Carry intentionally
The `any` casts are documented and constrained to two lines. Adding proper generics would complicate the hook's API for callers with minimal practical benefit, since the artifact schemas are stable and changes are immediately visible in the UI.

---

## Tech Debt Triage: 307-line onboarding overlay with inline SVG icons

**Location:** `app/components/features/onboarding/OnboardingOverlay.tsx`
**Nature:** structural

### Carrying Cost: Low
The onboarding overlay is a 307-line component with ~120 lines of inline SVG icons embedded in the `steps` array. The SVGs are not reused elsewhere and are defined as JSX literals in module scope. This makes the file long and hard to scan, but it is entirely self-contained with no external dependencies beyond React. The content (step text) will need updating as the product evolves.

### Fix Cost
- **Scope:** localized
- **Effort:** hours
- **Risk:** low
- **Incremental?** yes

### Urgency Triggers
- Need to add/remove onboarding steps frequently
- Want to A/B test onboarding content

### Recommendation: Carry intentionally
The SVGs are specific to this component and unlikely to be reused. Extracting them to separate icon components would add files without reducing total complexity. If the onboarding content needs frequent updates, consider extracting the step definitions to a separate data file.

---

## Tech Debt Triage: Dead code in `workspacePersistence.ts`

**Location:** `app/lib/utils/workspacePersistence.ts` (exported `saveWorkspace`, `SaveWorkspaceInput`, `ArtifactPersistenceData`)
**Nature:** structural (dead code)

### Carrying Cost: Low
These exports were used by the now-deleted `useWorkspacePersistence` hook. They remain exported and have test coverage, but no production code calls them. The `loadWorkspace` function is still used (for v2 migration), but the save-side functions are dead.

### Fix Cost
- **Scope:** localized
- **Effort:** minutes
- **Risk:** low
- **Incremental?** yes

### Urgency Triggers
- None

### Recommendation: Fix opportunistically
Remove `saveWorkspace`, `SaveWorkspaceInput`, `ArtifactPersistenceData`, and their tests. Keep `loadWorkspace` and the coercion functions which are still used.

---

## Triage Summary

| # | Debt Item | Carrying Cost | Fix Effort | Urgency | Recommendation |
|---|-----------|---------------|------------|---------|----------------|
| 1 | Duplicated `recordAndCache` in callLlm/streamLlm | Medium | hours | Low | Fix opportunistically |
| 2 | `page.tsx` monolithic orchestrator (~860 lines) | High | days | Low | Defer and monitor |
| 3 | `PersistedWorkspace` bridge layer losing version history | Medium | days | Low | Fix opportunistically |
| 4 | Unused `useAllArtifactEditing` hook (dead code) | Low | minutes | None | **Fix now** |
| 5 | Streaming/non-streaming API duality | Medium | days | Low | Carry intentionally |
| 6 | Incomplete dialectical-map rename (onboarding, prompt) | Low | minutes | Low | **Fix now** |
| 7 | Dual localStorage keys without cleanup | Medium | hours | Low | Fix opportunistically |
| 8 | `EditableSection` makes direct API calls | Low | hours | Low | Fix opportunistically |
| 9 | `useFieldUpdaters` untyped dynamic key access | Low | hours | None | Carry intentionally |
| 10 | Onboarding overlay with inline SVGs (307 lines) | Low | hours | None | Carry intentionally |
| 11 | Dead code in `workspacePersistence.ts` | Low | minutes | None | Fix opportunistically |

### Debt resolved by this branch

For context, this branch resolves significant pre-existing debt:

1. **Manual debounced localStorage persistence** replaced by Zustand `persist` middleware
2. **Stale closure risk in pipeline accessors** eliminated by `getState()` pattern
3. **No artifact edit history** resolved by `ArtifactRecord` versioning
4. **No streaming/progress feedback** for formalization resolved by SSE streaming infrastructure
5. **No inline editing for structured artifacts** resolved by `EditableSection` + `useFieldUpdaters`
6. **No onboarding flow** resolved by `OnboardingOverlay`
7. **"Dialectical Map" naming** mostly resolved by rename to "Balanced Perspectives"
