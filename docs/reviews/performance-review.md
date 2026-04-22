# Performance Code Review: `feat/custom-artifact-types`

**Branch:** `feat/custom-artifact-types` (8 commits, 23 files, +1434/-193)
**Reviewer focus:** Performance — algorithmic cost, memory lifecycle, serialization tax, re-render pressure
**Date:** 2026-04-07

## Data Flow and Hot Paths

This branch adds user-defined custom artifact types to the workspace. The main data paths are:

1. **Design flow** (cold path): User describes a type -> LLM designs the system prompt -> user refines -> saved to state.
2. **Generation flow** (warm path): Selected custom types are generated in parallel alongside built-in types via `useArtifactGeneration`. Each custom type hits `/api/formalization/custom` with the system prompt in the body.
3. **Persistence flow** (hot path on every state change): `useWorkspacePersistence` debounce-saves all state to localStorage every 500ms. Custom type definitions and generated data are now included in every save.
4. **Panel definition recomputation** (hot path on every render cycle): `usePanelDefinitions` now takes `artifactLoadingState` and `customArtifactData` as dependencies, both of which are object references that change frequently.

Expected data sizes: Custom artifact types are user-created, likely 1-10 definitions. Generated data is LLM output, typically 1-20KB per artifact. System prompts are capped at 10,000 characters.

## Findings

#### 1. `usePanelDefinitions` invalidated on every loading state change
**Severity:** Medium
**Location:** `app/hooks/usePanelDefinitions.tsx:200-205` (dependency array) and `app/page.tsx:562-568` (passing `artifactLoadingState`)
**Move:** Count the hidden multiplications
**Confidence:** High

The `usePanelDefinitions` hook now depends on `artifactLoadingState`, which is an object reference that changes on every `setLoadingState` call in `useArtifactGeneration` (at least twice per generation batch: once to set "generating", once to set final states). Each invalidation rebuilds the entire panel definitions array including all built-in and custom panels, and allocates new JSX elements for every icon. This feeds into `PanelShell` and `IconRail`, triggering a re-render cascade of the sidebar.

Previously, loading states for built-in types were passed as individual booleans (e.g., `causalGraphLoading`), which only invalidated when their specific boolean changed. The new pattern passes the whole loading state object, which breaks that granularity.

**Recommendation:** Extract only the custom-type loading booleans from `artifactLoadingState` before passing to `usePanelDefinitions`, or compute a stable derived value (e.g., a `Set<string>` of currently-generating custom type IDs) that only changes when the set of generating custom types actually changes.

---

#### 2. `renderPanel` useCallback has excessive dependency array
**Severity:** Medium
**Location:** `app/page.tsx:740-757` (dependency array of `renderPanel`)
**Move:** Count the hidden multiplications
**Confidence:** High

The `renderPanel` callback now includes `customArtifactTypes`, `customArtifactData`, `addCustomArtifactType`, `updateCustomArtifactType`, and `handleDeleteCustomType` in its dependency array. The first two are object/array references that change on every custom type or data mutation. Since `renderPanel` is passed to `PanelShell`, any change to these references invalidates the callback and may cause `PanelShell` to re-render.

The `customArtifactData` reference changes every time any custom artifact finishes generating (via `setCustomArtifactContent`), and `customArtifactTypes` changes on any add/edit/remove. Both are used inside `renderPanel` only for the `default:` branch (custom panel rendering), but their instability affects all panels.

**Recommendation:** Wrap `customArtifactData` and `customArtifactTypes` in refs inside `page.tsx` (like the existing `decompRef` / `artifactRef` pattern) and read from the ref inside `renderPanel`, removing them from the dependency array.

---

#### 3. Double JSON parse in custom artifact route
**Severity:** Low
**Location:** `app/api/formalization/custom/route.ts:17-20` and `app/lib/formalization/artifactRoute.ts:55-56`
**Move:** Find the serialization tax
**Confidence:** High

The custom route clones the request (`request.clone()`) and parses the body once to extract `customSystemPrompt` and `customOutputFormat`, then passes the original request to `handleArtifactRoute` which parses the body a second time. For a typical request body (source text can be 10-50KB of document text), this means two full JSON parse operations.

This is a cold path (one request per generation), so the absolute cost is small. But it is unnecessary work and the clone is a wasted allocation.

**Recommendation:** Parse the body once, then pass the parsed object directly. `handleArtifactRoute` could accept a pre-parsed body as an alternative to a `NextRequest`. Alternatively, the `transformBody` hook already receives the raw parsed body — extract the custom fields there instead of pre-parsing.

---

#### 4. `customArtifactData` grows without cleanup on workspace session switch
**Severity:** Low
**Location:** `app/hooks/useWorkspacePersistence.ts:159-164` (`removeCustomArtifactType`) vs session switch logic
**Move:** Trace the memory lifecycle
**Confidence:** Medium

When a custom type is explicitly deleted via `removeCustomArtifactType`, its generated data is cleaned from `customArtifactData`. However, when switching workspace sessions via `resetToSnapshot` or `clearWorkspace`, the new snapshot's `customArtifactData` is loaded wholesale. If the snapshot was saved when many custom types existed but some were later removed from the type definitions, the data keys for removed types persist in localStorage.

The `loadWorkspace` function does not filter `customArtifactData` keys against the loaded `customArtifactTypes` — it accepts any string-keyed entries. Over time, orphaned data entries accumulate in localStorage.

**Recommendation:** In `loadWorkspace`, filter `customArtifactData` keys to only those present in `customArtifactTypes`. This is a one-line change in the load path and prevents unbounded growth of stale data.

---

#### 5. `selectedDescriptions` recomputed on every render with linear scan
**Severity:** Low
**Location:** `app/components/features/artifact-selector/ArtifactChipSelector.tsx:90-100`
**Move:** Check the asymptotic behavior
**Confidence:** Medium

`selectedDescriptions` does a `.find()` over `customTypes` for each selected type, giving O(selected * customTypes) per render. With realistic sizes (7 built-in + ~5 custom, ~5 selected), this is ~25 comparisons — negligible. However, this runs on every render of the chip selector (which re-renders on typing in the source text input due to prop changes).

**Recommendation:** This is fine at current scale. If custom types grow significantly, memoize with `useMemo` keyed on `selected` and `customTypes`.

---

#### 6. Incorrect version comment in persistence type
**Severity:** Informational
**Location:** `app/lib/types/persistence.ts:32`
**Move:** (Fact-check integration)
**Confidence:** High (from fact-check report)

The comment `// Custom artifact types and their generated data (added in v2)` implies this was a version bump, but `WORKSPACE_VERSION` was already 2 before this branch and remains 2. The new fields are optional (`?`), so backward compatibility is maintained, but the comment misleadingly suggests a versioning event that did not occur. If a future developer relies on this comment to understand the migration history, they will be misled.

**Recommendation:** Change the comment to something like `// Custom artifact types and their generated data (optional, backward-compatible addition)`.

---

#### 7. Unverifiable cross-session library reference
**Severity:** Informational
**Location:** `app/lib/types/customArtifact.ts:7`
**Move:** (Fact-check integration)
**Confidence:** High (from fact-check report)

The module doc comment mentions definitions are "optionally saved to a cross-session library." No cross-session library implementation exists in this branch — definitions are saved per-workspace via localStorage persistence. This is aspirational documentation that could confuse readers or reviewers.

**Recommendation:** Remove the cross-session library mention, or add a TODO comment noting it as a planned future feature.

---

#### 8. `ARTIFACT_RESPONSE_KEY` mapping comment oversimplifies
**Severity:** Informational
**Location:** `app/lib/types/artifacts.ts:200`
**Move:** (Fact-check integration)
**Confidence:** Medium (from fact-check report)

The comment says "kebab-case -> camelCase" but the mapping is not a mechanical conversion — `semiformal` maps to `proof`, `lean` maps to `leanCode`, etc. The comment is mostly accurate for the newer types but misleading as a general description. The branch changes `ArtifactType` to `BuiltinArtifactType` here, which is correct.

**Recommendation:** Update the comment to "Maps built-in artifact types to their JSON response field name" without implying a naming convention.

## What Looks Good

- **System prompt length cap** (`MAX_SYSTEM_PROMPT_LENGTH = 10_000` in the custom route) prevents injection of arbitrarily large prompts into LLM calls. Good defensive boundary.
- **`isValidCustomTypeDef` validation** on load prevents malformed data from crashing the app after localStorage corruption.
- **Stale selection cleanup** via the `useEffect` in `page.tsx:114-119` that filters out custom type IDs when definitions are removed — prevents phantom selections.
- **`customDefsMap` in `useArtifactGeneration`** — building a Map for O(1) lookup per custom type during parallel generation is the right call.
- **`updateCustomArtifactType` clears stale data** when the system prompt changes — prevents showing outdated generated content.
- **Parallel generation** via `Promise.allSettled` — custom types generate concurrently with built-in types, no sequential bottleneck.

## Summary Table

| # | Finding | Severity | Confidence | Location |
|---|---------|----------|------------|----------|
| 1 | `usePanelDefinitions` invalidated on every loading state change | Medium | High | `usePanelDefinitions.tsx:200`, `page.tsx:562-568` |
| 2 | `renderPanel` excessive dependency array causes re-render cascade | Medium | High | `page.tsx:740-757` |
| 3 | Double JSON parse in custom artifact route | Low | High | `custom/route.ts:17-20` |
| 4 | Orphaned `customArtifactData` keys accumulate in localStorage | Low | Medium | `useWorkspacePersistence.ts`, `workspacePersistence.ts:206-212` |
| 5 | `selectedDescriptions` linear scan per render | Low | Medium | `ArtifactChipSelector.tsx:90-100` |
| 6 | Incorrect "added in v2" comment (fact-check) | Informational | High | `persistence.ts:32` |
| 7 | Unverifiable cross-session library reference (fact-check) | Informational | High | `customArtifact.ts:7` |
| 8 | Oversimplified key naming comment (fact-check) | Informational | Medium | `artifacts.ts:200` |

## Overall Assessment

No critical or high-severity performance issues. The two medium findings (1 and 2) are about **re-render pressure** — passing unstable object references into `useMemo`/`useCallback` dependency arrays that previously had stable, granular dependencies. These will cause unnecessary re-renders of the sidebar and panel shell on every loading state transition, which happens during artifact generation (a period when the user is already waiting and the UI should feel responsive, not janky). Both are straightforward to fix using the ref-based patterns already established elsewhere in `page.tsx`.

The low-severity items are minor inefficiencies that do not affect user experience at current scale but represent technical debt that compounds if custom types become heavily used.

The feature is architecturally sound — it correctly extends the existing artifact pipeline without modifying built-in type behavior, validates user input at both API and persistence boundaries, and generates custom types in parallel.
