# Test Strategy Review: feat/graph-persistence-editing

**Date:** 2026-04-03
**Branch:** `feat/graph-persistence-editing` vs `main`
**Scope:** Zustand state management, streaming LLM API, artifact editing, versioned persistence, new UI components

---

## Test Conventions

- **Framework:** Vitest with React Testing Library, jsdom environment
- **Config:** `vitest.config.ts` at repo root, setup in `vitest.setup.ts`
- **Location pattern:** Co-located test files (`Foo.test.tsx` next to `Foo.tsx`) for components and utils; `__tests__/` subdirectory for store tests
- **Naming:** `describe`/`it` blocks, descriptive test names
- **Mocking:** `vi.mock()` for module-level mocks, `vi.fn()` for individual functions
- **Run:** `npm test` (all), `npm run test:watch` (watch mode)
- **Current test count:** ~20 test files under `app/`

---

## Classification of Changes by Risk

### Critical (high blast radius, core data path)

| File | What changed | Existing tests |
|------|-------------|----------------|
| `app/lib/stores/workspaceStore.ts` | **New file.** Zustand store replacing `useWorkspacePersistence`. All workspace state, artifact versioning (undo/redo), persistence, migration from v2. | `workspaceStore.test.ts`, `workspaceStore-hydration.test.ts` -- good coverage of core operations |
| `app/lib/llm/streamLlm.ts` | **New file.** Streaming LLM call with SSE protocol, provider chain (Anthropic/OpenRouter/mock), cache integration. | `streamLlm.test.ts` -- covers mock fallback, cache hit, SSE parsing |
| `app/lib/formalization/api.ts` | **New file.** `fetchApi`, `fetchStreamingApi` (SSE client parser), `verifyLean`, `generateLean`, streaming variants. | `fetchStreamingApi` tested via `streamLlm.test.ts` (indirect). `fetchApi` untested. |
| `app/hooks/useArtifactGeneration.ts` | **Major rewrite.** Parallel streaming generation with per-type generation counters, supersession detection, partial-JSON preview. | **No tests.** |
| `app/page.tsx` | **Major rewrite.** Wired to Zustand store, new `storeArtifactResults` callback with duplicated version-cap logic. | **No tests.** |

### High (new feature logic, user-facing)

| File | What changed | Existing tests |
|------|-------------|----------------|
| `app/hooks/useArtifactEditing.ts` | **New file.** AI editing hook for structured artifacts (inline + whole-document). | **No tests.** |
| `app/hooks/useFieldUpdaters.ts` | **New file.** `updateField`/`updateArrayItem` helpers for editing structured JSON. | **No tests.** |
| `app/api/edit/artifact/route.ts` | **New file.** API route for AI editing of JSON artifacts. Input validation, JSON repair on LLM output. | **No tests.** |
| `app/components/features/output-editing/EditableSection.tsx` | **New file.** Section-level inline editing with AI edit bar. | **No tests.** |
| `app/lib/utils/stripCodeFences.ts` | **New file.** `stripCodeFences` and `stripLeadingCodeFence` for LLM output cleanup. | **No tests.** |
| `app/lib/utils/throttle.ts` | **New file.** Throttle utility with trailing-edge delivery. | **No tests.** |

### Medium (UI panels, display changes)

| File | What changed | Existing tests |
|------|-------------|----------------|
| `app/components/panels/CausalGraphPanel.tsx` | Wired to Zustand + artifact editing + streaming preview | **No tests.** |
| `app/components/panels/StatisticalModelPanel.tsx` | Same pattern as CausalGraphPanel | **No tests.** |
| `app/components/panels/PropertyTestsPanel.tsx` | Same pattern | **No tests.** |
| `app/components/panels/BalancedPerspectivesPanel.tsx` | **New file.** New artifact panel. | **No tests.** |
| `app/components/panels/CounterexamplesPanel.tsx` | Wired to new store patterns | **No tests.** |
| `app/components/features/onboarding/OnboardingOverlay.tsx` | **New file.** Onboarding flow. | **No tests.** |
| `app/hooks/useStreamingMerge.ts` | **New file.** Tiny helper merging final data with streaming preview. | **No tests.** |

### Low (config, types, docs)

| File | What changed |
|------|-------------|
| `app/lib/types/artifactStore.ts` | New types (ArtifactKey, ArtifactVersion, ArtifactRecord, MAX_VERSIONS) |
| `app/lib/types/artifacts.ts` | Route/response-key maps |
| Various panel components | UI wiring changes, prop changes |
| `docs/*`, `scripts/*` | Documentation, tooling |

---

## Recommended Tests

### 1. `stripCodeFences` and `stripLeadingCodeFence`

**Type:** Unit
**Priority:** High
**File:** `app/lib/utils/stripCodeFences.test.ts`
**What it verifies:** LLM output cleanup that every artifact generation and editing path depends on.
**Key cases:**
- Input with ` ```json\n{...}\n``` ` returns the inner JSON
- Input with ` ```\n{...}\n``` ` (no language tag) returns inner content
- Input with no fences returns the input trimmed
- Input with multiple fence blocks returns content of the first
- `stripLeadingCodeFence`: removes leading ` ```json\n ` but leaves rest intact (for streaming)
- `stripLeadingCodeFence`: no-op on text without leading fence
**Setup needed:** None -- pure functions, no mocks.
**Effort:** Very low. ~20 minutes.

---

### 2. `throttle` utility

**Type:** Unit
**Priority:** High
**File:** `app/lib/utils/throttle.test.ts`
**What it verifies:** Throttle behavior used in every streaming artifact generation path.
**Key cases:**
- First call executes immediately
- Rapid calls within `ms` are collapsed; trailing call is delivered
- After `ms` elapses, next call executes immediately again
- `.cancel()` prevents pending trailing invocation
- Callback receives correct arguments on both leading and trailing edge
**Setup needed:** `vi.useFakeTimers()` for deterministic timing.
**Effort:** Low. ~30 minutes.

---

### 3. `useFieldUpdaters` hook

**Type:** Unit
**Priority:** High
**File:** `app/hooks/useFieldUpdaters.test.ts`
**What it verifies:** The JSON field-update logic used by all artifact panel `EditableSection` onChange handlers.
**Key cases:**
- `updateField("key", "newValue")` produces correct JSON with that field changed
- `updateField` with same value as current is a no-op (does not call `onContentChange`)
- `updateArrayItem("items", 1, "new")` updates the correct index
- `updateArrayItem` with same value is a no-op
- `data` is null: both functions are no-ops (no crash)
- `onContentChange` is undefined: both functions are no-ops
**Setup needed:** `renderHook` from React Testing Library.
**Effort:** Low. ~30 minutes.

---

### 4. `useArtifactEditing` hook -- selection-based string splicing

**Type:** Unit
**Priority:** High
**File:** `app/hooks/useArtifactEditing.test.ts`
**What it verifies:** The inline edit path that splices AI-edited text into content at selection boundaries.
**Key cases:**
- Inline edit with selection `{start: 5, end: 10, text: "world"}` replaces those characters correctly
- Whole-document edit replaces entire content
- `getContent()` returning null is a no-op (no crash, no API call)
- Loading state (`editing`) is true during request, false after
**Setup needed:** Mock `fetchApi` via `vi.mock("@/app/lib/formalization/api")`. Use `renderHook`.
**Effort:** Medium. ~45 minutes.

---

### 5. `coerceArtifactVersion` / `coerceArtifactRecord` validation (via rehydration)

**Type:** Integration
**Priority:** High
**File:** `app/lib/stores/__tests__/workspaceStore-hydration.test.ts`
**What it verifies:** Malformed persisted data is safely rejected or defaulted during rehydration, preventing silent data loss.
**Key cases:**
- Version with missing `id` field is dropped
- Version with missing `content` field is dropped
- Version with invalid `source` (e.g. `"hacked"`) defaults to `"generated"`
- Version with non-string `createdAt` gets a default ISO string
- Mixed valid/invalid versions in an array: only valid ones survive
- ArtifactRecord with empty versions array after filtering is dropped entirely
- `currentVersionIndex` out of bounds is clamped
**Setup needed:** Pre-populate `localStorage` with `workspace-zustand-v1` key containing malformed version entries, then call `rehydrate()`.
**Effort:** Medium. ~45 minutes.

---

### 6. `setArtifactsBatchGenerated` -- multi-artifact atomic update

**Type:** Unit
**Priority:** Medium
**File:** `app/lib/stores/__tests__/workspaceStore.test.ts`
**What it verifies:** Batch generation updates multiple artifact types atomically without clobbering existing records.
**Key cases:**
- Batch-generate two artifacts at once: both are stored
- Batch-generate when one artifact already has versions: appends correctly, does not reset history
- Batch-generate does not affect artifacts not in the batch
- Version cap is respected when batch-appending to an artifact with many existing versions
**Setup needed:** Direct store manipulation (already established in existing tests).
**Effort:** Low. ~20 minutes.

---

### 7. `resolveArtifactContent` edge cases

**Type:** Unit
**Priority:** Medium
**File:** `app/lib/stores/__tests__/workspaceStore.test.ts`
**What it verifies:** The helper that resolves current content from an ArtifactRecord handles degenerate inputs.
**Key cases:**
- `undefined` input returns `null`
- Record with `currentVersionIndex` pointing past end of versions array returns `null` (via optional chaining)
- Record with empty versions array returns `null`
- Normal case returns the content at `currentVersionIndex`
**Setup needed:** Import `resolveArtifactContent` directly (it is exported).
**Effort:** Very low. ~15 minutes.

---

### 8. `fetchStreamingApi` error handling

**Type:** Unit
**Priority:** Medium
**File:** `app/lib/formalization/api.test.ts`
**What it verifies:** The client-side SSE parser handles error events and incomplete streams.
**Key cases:**
- SSE stream with `event: error` throws an Error with the message
- Stream that ends without a `done` event throws "Stream ended without a done event"
- Non-OK HTTP response throws with error message from body
- Malformed SSE lines (missing `data:` prefix, invalid JSON) are skipped without crashing
**Setup needed:** Mock `globalThis.fetch` to return a `ReadableStream` body (pattern already established in `streamLlm.test.ts`).
**Effort:** Medium. ~30 minutes.

---

### 9. `useStreamingMerge` hook

**Type:** Unit
**Priority:** Medium
**File:** `app/hooks/useStreamingMerge.test.ts`
**What it verifies:** Merge logic preferring final data over streaming preview.
**Key cases:**
- `finalData` present: returns it regardless of `streamingPreview`
- `finalData` null, `streamingPreview` present: returns preview
- Both null: returns `{ displayData: null, hasDisplayData: false }`
- `hasContent` predicate controls `hasDisplayData` even when `displayData` is non-null
**Setup needed:** Direct function call (it's a pure function despite the `use` prefix).
**Effort:** Very low. ~15 minutes.

---

### 10. `edit/artifact` API route -- JSON validation

**Type:** Integration
**Priority:** Medium
**File:** `app/api/edit/artifact/route.test.ts`
**What it verifies:** The route validates inputs, handles LLM mock responses, and rejects invalid JSON from LLM.
**Key cases:**
- Missing `content` returns 400
- Missing `instruction` returns 400
- Whole edit with mock provider returns mock-formatted content
- Inline edit with selection returns mock replacement text
- `stripCodeFences` is applied to clean up LLM JSON output
**Setup needed:** Mock `callLlm` via `vi.mock`. Construct `NextRequest` objects (pattern may need to be established; this would be the first API route test in the project).
**Effort:** Medium-high. ~60 minutes (first API route test establishes pattern).

---

### 11. `sanitizeDecomposition` memoization correctness

**Type:** Unit
**Priority:** Low
**File:** `app/lib/stores/__tests__/workspaceStore-hydration.test.ts`
**What it verifies:** Module-level memoization cache does not serve stale data.
**Key cases:**
- Set decomposition, flush persist timer, verify sanitized statuses in localStorage
- Change decomposition to new reference, flush again, verify new data persisted (not cached old data)
**Setup needed:** Store manipulation + `vi.advanceTimersByTime(300)` to flush debounced writes.
**Effort:** Low. ~20 minutes.

---

## What NOT to Test

### Panel components (`CausalGraphPanel`, `StatisticalModelPanel`, etc.)
These are thin wiring layers that call hooks and render UI. The interesting logic lives in the hooks (`useArtifactEditing`, `useFieldUpdaters`, `useStreamingMerge`) and the store -- all of which are tested at the unit level. Snapshot or render tests for these panels would be brittle and add maintenance cost disproportionate to the bugs they'd catch.

### `OnboardingOverlay`
Pure UI component with localStorage flag toggling. Risk of regression is low and detection is trivial (visual).

### `useCausalGraphLayout` changes
Layout algorithm changes are best validated visually. Unit tests for layout coordinates would be extremely brittle.

### `page.tsx` orchestration
The root component is too deeply integrated (many hooks, many children) for meaningful unit testing. Its logic is better covered by testing the hooks and store it depends on, plus eventual e2e tests.

### `useWorkspaceSessions` changes
Small prop threading change. The session-switching logic is not materially altered.

### Documentation files, scripts, type-only files
No runtime behavior to test.

---

## Coverage Gaps Beyond Current Scope

These are pre-existing untested areas that represent significant risk:

1. **`useFormalizationPipeline` hook** -- Orchestrates the deductive pipeline (semiformal -> lean -> verify loop). No tests. Central to the app's core workflow.

2. **`useDecomposition` hook** -- Manages the proposition graph. No tests. Coupled to persistence and decomposition API.

3. **`useWorkspaceSessions` hook** -- Snapshot bridge between workspace sessions and the Zustand store. No tests. A bug here loses user data on session switch.

4. **`useAutoFormalizeQueue` hook** -- Automatic formalization queue for decomposed nodes. No tests. Complex async state machine.

5. **`callLlm` provider chain** -- The non-streaming LLM call. Only the streaming variant (`streamLlm`) has tests. The original `callLlm` function has no test file.

6. **localStorage quota handling** -- The old `saveWorkspace` tested quota errors. The new debounced Zustand storage adapter catches errors silently. No test verifies the error is caught (only that the `catch` exists).

---

## Implementation Order

| Order | Tests | Estimated time | Cumulative risk reduced |
|-------|-------|---------------|------------------------|
| 1 | #1 `stripCodeFences` + #2 `throttle` | ~50 min | Covers utilities used by every generation + editing path |
| 2 | #3 `useFieldUpdaters` + #7 `resolveArtifactContent` + #9 `useStreamingMerge` | ~50 min | Quick wins, pure logic |
| 3 | #5 Rehydration validation (coerce*) | ~45 min | Protects persisted data integrity |
| 4 | #4 `useArtifactEditing` + #6 `setArtifactsBatchGenerated` | ~65 min | Covers editing + batch generation |
| 5 | #8 `fetchStreamingApi` error paths | ~30 min | Client-side resilience |
| 6 | #10 API route, #11 memo correctness | ~80 min | Lower priority, higher effort |

**Total estimated time: ~5-6 hours** for all recommended tests. Tests 1-3 (the first ~2.5 hours) cover the highest-value gaps.
