# Tech Debt Triage Review: feat/graph-persistence-editing vs feat/zustand-wire-page

**Branch:** `feat/graph-persistence-editing` relative to `feat/zustand-wire-page`
**Reviewed:** 2026-04-03
**Scope:** 87 files changed, ~6400 additions, ~1800 deletions. This diff layers streaming API, artifact editing, onboarding, graph persistence/editing, balanced-perspectives rename, and UI visibility changes on top of the Zustand store migration.

---

## TD-1: Duplicated `recordAndCache` between `callLlm.ts` and `streamLlm.ts`

**Location:** `app/lib/llm/callLlm.ts` (line ~77), `app/lib/llm/streamLlm.ts` (line ~35)
**Nature:** structural duplication

### Carrying Cost: Medium
Two implementations of the same analytics-write + cache-write pattern with slightly different signatures. `callLlm`'s version takes a `cacheKey` param and returns `CallLlmResult`; `streamLlm`'s takes only the hash and returns void. The `streamLlm` version also omits the `cacheKey` field when writing to cache, which means cached streaming results lack the key needed for cache invalidation. Any change to analytics entry shape, caching strategy, or error handling must be applied twice. The comment "same as callLlm's recordAndCache" is helpful but does not prevent drift.

### Fix Cost
- **Scope:** localized (two files in `lib/llm/`)
- **Effort:** hours
- **Risk:** low
- **Incremental?** yes

### Urgency Triggers
- Adding a third LLM calling pattern (e.g., batch, tool-use)
- Changing analytics schema or cache format

### Recommendation: Fix opportunistically
Extract a shared `recordAndCache` into `app/lib/llm/analytics.ts` or a shared module. Parameterize the return type.

---

## TD-2: `page.tsx` remains an ~860-line monolithic orchestrator (growing)

**Location:** `app/page.tsx`
**Nature:** structural

### Carrying Cost: High
This diff adds ~30 net lines to `page.tsx`: graph editing handlers (`handleAddNode`, `handleDeleteEdges`), graph layout persistence wiring, `updateGraphLayout` in the decomposition persistence effect, and 7 new props passed through to `GraphPanel`. The `renderPanel` callback's dependency array now lists 28 items. Each new feature (graph editing, streaming previews, balanced-perspectives rename) required touching 3-6 sections of this file. The file is still well-organized with clear sections, but the surface area for merge conflicts continues to grow.

### Fix Cost
- **Scope:** cross-cutting (would need sub-orchestrators or context providers)
- **Effort:** days
- **Risk:** medium (re-render regressions)
- **Incremental?** yes (can extract one concern at a time)

### Urgency Triggers
- Adding more artifact types (each adds ~20 lines across multiple sections)
- Multiple contributors working concurrently on state-related features
- `renderPanel` dependency array exceeding ~30 items (performance/correctness risk)

### Recommendation: Defer and monitor
The Zustand store already decouples state management, making future extraction easier. The natural first extraction would be the graph editing concern: `handleAddNode`, `handleDeleteEdges`, `updateGraphLayout`, and the layout persistence effect could move into a `useGraphEditing` hook. Wait for a concrete pain point before acting.

---

## TD-3: `addGraphEdge` stale closure bug risk in `useDecomposition`

**Location:** `app/hooks/useDecomposition.ts` (line ~147)
**Nature:** correctness risk

### Carrying Cost: High
`addGraphEdge` reads `state.nodes` directly (not via `setState` updater) to perform cycle detection and returns a synchronous boolean. This creates a stale closure risk: if two edges are added in rapid succession (e.g., user draws two edges quickly), the second call reads the pre-first-edge `state.nodes` because React may not have re-rendered yet. The comment "Read state directly to avoid React 18 batching race" acknowledges the tradeoff but picks the wrong side -- the updater function pattern is specifically designed for this. The current approach trades correctness (stale reads) for convenience (synchronous return value).

In practice, human interaction speed makes rapid double-edge unlikely, but the pattern is fragile and a bad precedent. All other graph operations in the same file correctly use the `setState` updater pattern.

### Fix Cost
- **Scope:** localized (single function, ~10 lines)
- **Effort:** hours
- **Risk:** low
- **Incremental?** yes

### Urgency Triggers
- Adding programmatic edge creation (e.g., from LLM suggestions)
- Any automated graph editing that could trigger rapid successive calls

### Recommendation: Fix now
Use `useRef` to hold the latest nodes (updated by a `useEffect`) for the cycle check, or restructure so `addGraphEdge` uses the `setState` updater and communicates success via a callback or event rather than a synchronous return value.

---

## TD-4: `PersistedWorkspace` bridge layer between Zustand store and workspace sessions

**Location:** `app/page.tsx` (lines ~107-161), `app/lib/stores/workspaceStore.ts` (lines ~237-276)
**Nature:** structural

### Carrying Cost: Medium
Workspace sessions still speak `PersistedWorkspace` (old flat-field format where artifacts are `string | null`). The Zustand store uses `ArtifactRecord` with version history. Session save/restore round-trips through conversion code that discards undo history. The `PERSISTED_ARTIFACT_FIELDS` mapping creates tight coupling between store internals and the page orchestrator. This diff does not change this situation but adds `graphLayout` to the persistence path, further entrenching the pattern.

### Fix Cost
- **Scope:** cross-cutting (workspace sessions, page.tsx, store, persistence types)
- **Effort:** days
- **Risk:** medium (localStorage migration needed)
- **Incremental?** partially

### Urgency Triggers
- Users expecting undo/redo to survive session switches
- Adding more fields to `ArtifactRecord`

### Recommendation: Fix opportunistically
When workspace sessions are next touched, update `WorkspaceSession.workspace` to store `WorkspaceState` directly.

---

## TD-5: Streaming/non-streaming API duality

**Location:** `app/lib/formalization/api.ts`, `app/hooks/useArtifactGeneration.ts`, `app/lib/formalization/formalizeNode.ts`
**Nature:** structural

### Carrying Cost: Medium
The diff adds streaming variants (`generateSemiformalStreaming`, `generateLeanStreaming`, `fetchStreamingApi`) alongside existing non-streaming versions. The global pipeline uses streaming; the auto-formalize queue (`formalizeNode.ts`) still uses non-streaming `fetchApi`. Two code paths for the same LLM calls with different error handling, response parsing, and progress reporting. The API routes now conditionally branch on `stream: true`.

### Fix Cost
- **Scope:** cross-cutting
- **Effort:** days
- **Risk:** medium (auto-queue has its own concurrency/cancel logic)
- **Incremental?** yes (one call site at a time)

### Urgency Triggers
- Removing the `stream: true` conditional from API routes
- Users wanting progress feedback during auto-formalization

### Recommendation: Carry intentionally
The non-streaming path is functional and well-tested. Migrating it to streaming requires handling SSE parsing + cancel-signal interaction. Worth doing eventually, not blocking today.

---

## TD-6: `EditableSection` makes direct API calls from a UI component

**Location:** `app/components/features/output-editing/EditableSection.tsx` (lines ~77-88)
**Nature:** structural

### Carrying Cost: Low
`EditableSection` imports `fetchApi` and calls `/api/edit/whole` and `/api/edit/artifact` directly, bypassing the `useArtifactEditing` hook. This violates the app's pattern where components receive callbacks from hooks. No loading state visible to parent, no wait-time estimation, no cancellation support.

### Fix Cost
- **Scope:** localized (one component + one hook)
- **Effort:** hours
- **Risk:** low
- **Incremental?** yes

### Urgency Triggers
- Users requesting cancel for section edits
- Need to track analytics for section-level AI edits

### Recommendation: Fix opportunistically
Lift the API call into a callback from the parent, consistent with `onAiEdit` for whole-document edits.

---

## TD-7: Incomplete rename from "dialectical-map" to "balanced-perspectives"

**Location:** `app/components/features/onboarding/OnboardingOverlay.tsx`, `app/api/formalization/balanced-perspectives/route.ts`
**Nature:** naming inconsistency

### Carrying Cost: Low
The rename is ~95% complete. Residual references: (1) the system prompt still says "dialectical analyst" and "dialectical landscape", (2) minor inconsistencies in onboarding text. The persistence layer correctly handles the old field name as a migration fallback.

### Fix Cost
- **Scope:** localized (string literals)
- **Effort:** minutes
- **Risk:** low
- **Incremental?** yes

### Urgency Triggers
- User-facing inconsistency in prompts or onboarding

### Recommendation: Fix now
Two-line fix with no architectural impact.

---

## TD-8: Dual localStorage keys without cleanup (`workspace-v2` + `workspace-zustand-v1`)

**Location:** `app/lib/stores/workspaceStore.ts` (lines ~474-490)
**Nature:** structural

### Carrying Cost: Medium
The `onRehydrateStorage` callback checks for `workspace-v2` on every app load. It never cleans up the old key after successful migration. Stale data occupies localStorage quota indefinitely. If a Zustand store bug causes data loss, the app might silently re-migrate stale v2 data.

### Fix Cost
- **Scope:** localized
- **Effort:** hours
- **Risk:** low
- **Incremental?** yes

### Urgency Triggers
- Users with large workspaces hitting localStorage quota
- Enough time passes to drop old format support

### Recommendation: Fix opportunistically
Add `localStorage.removeItem` after successful migration.

---

## TD-9: Unused `useAllArtifactEditing` hook (dead code)

**Location:** `app/hooks/useArtifactEditing.ts` (lines ~70+)
**Nature:** dead code

### Carrying Cost: Low
The `useAllArtifactEditing` convenience hook is exported but has zero callers. Its docstring references `useWorkspacePersistence` (deleted hook), suggesting it was written for an earlier integration plan. ~45 lines of dead code with an outdated API surface.

### Fix Cost
- **Scope:** localized (single file, single function)
- **Effort:** minutes
- **Risk:** low
- **Incremental?** yes

### Urgency Triggers
- None (dead code has zero runtime impact)

### Recommendation: Fix now
Delete `useAllArtifactEditing` and the stale docstring.

---

## TD-10: `useFieldUpdaters` uses `any` casts and untyped dynamic key access

**Location:** `app/hooks/useFieldUpdaters.ts` (lines 15, 22)
**Nature:** typing

### Carrying Cost: Low
`updateField` and `updateArrayItem` use `(data as any)[key]` with eslint-disable comments. TypeScript cannot verify key existence or value types. A typo in a key string would not be caught at compile time.

### Fix Cost
- **Scope:** localized
- **Effort:** hours (generics with `keyof` constraints)
- **Risk:** low
- **Incremental?** yes

### Urgency Triggers
- None (artifact schemas are stable, bugs caught quickly in manual testing)

### Recommendation: Carry intentionally
The `any` casts are documented and constrained to two lines. The practical benefit of proper generics is minimal given the stable schemas.

---

## TD-11: Dead code in `workspacePersistence.ts`

**Location:** `app/lib/utils/workspacePersistence.ts` (exported `saveWorkspace`, `SaveWorkspaceInput`, `ArtifactPersistenceData`)
**Nature:** dead code

### Carrying Cost: Low
These exports were used by the now-deleted `useWorkspacePersistence` hook. The save-side functions are dead; `loadWorkspace` is still used for v2 migration.

### Fix Cost
- **Scope:** localized
- **Effort:** minutes
- **Risk:** low
- **Incremental?** yes

### Urgency Triggers
- None

### Recommendation: Fix opportunistically
Remove `saveWorkspace`, `SaveWorkspaceInput`, `ArtifactPersistenceData`, and their tests. Keep `loadWorkspace` and coercion functions.

---

## TD-12: 307-line onboarding overlay with inline SVG icons

**Location:** `app/components/features/onboarding/OnboardingOverlay.tsx`
**Nature:** structural

### Carrying Cost: Low
~120 lines of inline SVG icons embedded in the `steps` array. The component is self-contained with no external dependencies beyond React. The content will need updating as the product evolves.

### Fix Cost
- **Scope:** localized
- **Effort:** hours
- **Risk:** low

### Urgency Triggers
- Need to add/remove onboarding steps frequently

### Recommendation: Carry intentionally
The SVGs are specific to this component. Extracting them adds files without reducing total complexity. If content updates become frequent, extract step definitions to a data file.

---

## TD-13: `GraphPanel` prop sprawl (17 props, 7 new)

**Location:** `app/components/panels/GraphPanel.tsx`
**Nature:** structural

### Carrying Cost: Medium
`GraphPanel` now takes 17 props. Seven of those were added in this diff for graph editing: `graphLayout`, `onLayoutChange`, `onAddNode`, `onDeleteNode`, `onRenameNode`, `onConnectNodes`, `onDeleteEdges`. All are optional (guarded with `?`), which means the component works in read-only mode when they are absent. However, the prop list is now long enough that it is easy to miss one when wiring things up, and the type definition spans 21 lines. This is a direct consequence of TD-2 (page.tsx as sole orchestrator): props must thread through the page to reach the component.

### Fix Cost
- **Scope:** localized (could group editing callbacks into a single `editingHandlers` object)
- **Effort:** hours
- **Risk:** low
- **Incremental?** yes

### Urgency Triggers
- Adding more graph editing operations (e.g., merge nodes, change node kind)
- Adding a second graph panel (e.g., causal graph editing)

### Recommendation: Fix opportunistically
Group the 7 editing callbacks into a single `graphEditing?: GraphEditingHandlers` prop. This reduces the prop list to 11 and makes it clear which props are editing-related vs. structural.

---

## TD-14: `useCausalGraphLayout` and `useGraphLayout` near-duplicate incremental layout logic

**Location:** `app/components/features/causal-graph/useCausalGraphLayout.ts`, `app/components/features/proof-graph/useGraphLayout.ts`
**Nature:** structural duplication

### Carrying Cost: Medium
Both hooks implement the same incremental-Dagre-layout pattern: `positionsRef` as accumulator, "only run Dagre for new nodes," edge-arrival detection (in causal graph), position pruning (in proof graph). The pattern is documented with identical comments in both files. `useGraphLayout` additionally supports persisted initial positions and exports `updateNodePosition` / `getPositions`. The causal graph hook does not. If the layout strategy changes (e.g., switching from Dagre to ELK, fixing a layout bug), both must be updated.

### Fix Cost
- **Scope:** medium (would need a shared incremental layout utility parameterized by node/edge shapes)
- **Effort:** hours to a day
- **Risk:** low (both are well-tested through usage)
- **Incremental?** yes (extract shared core, adapt each hook)

### Urgency Triggers
- Switching layout library (e.g., Dagre to ELK)
- Adding incremental layout to a third graph type
- Bug in layout logic that must be fixed in both

### Recommendation: Fix opportunistically
Next time either hook is touched, extract the shared incremental-Dagre logic into `app/lib/utils/incrementalDagreLayout.ts` parameterized by node dimensions and edge extraction. Each hook becomes a thin wrapper.

---

## TD-15: `streamLlm.ts` duplicates provider chain logic from `callLlm.ts`

**Location:** `app/lib/llm/streamLlm.ts` (321 lines), `app/lib/llm/callLlm.ts`
**Nature:** structural duplication

### Carrying Cost: Medium
`streamLlm` reimplements the Anthropic -> OpenRouter -> mock provider fallback chain from `callLlm`, but with streaming variants. The two files share imports (`OPENROUTER_API_URL`, `DEFAULT_ANTHROPIC_MODEL`, `getAnthropicClient`), but the env-var reading, model selection, and error handling are duplicated. This is broader than TD-1 (which is just `recordAndCache`) -- the entire provider-selection and request-construction logic is duplicated.

### Fix Cost
- **Scope:** medium (would need a provider-selection module and streaming/non-streaming adapters)
- **Effort:** days
- **Risk:** medium (touching the LLM infrastructure)
- **Incremental?** partially (could extract provider selection first, then adapt streaming)

### Urgency Triggers
- Adding a third provider (e.g., Google, local model)
- Changing auth or routing logic (must update both files)

### Recommendation: Fix opportunistically
When adding a new provider or changing routing logic, extract provider selection into a shared module. The streaming and non-streaming code paths would become thin adapters over the provider abstraction.

---

## Triage Summary

| # | Debt Item | Carrying Cost | Fix Effort | Urgency | Recommendation |
|---|-----------|---------------|------------|---------|----------------|
| TD-3 | `addGraphEdge` stale closure bug risk | High | hours | Medium | **Fix now** |
| TD-7 | Incomplete dialectical-map rename | Low | minutes | Low | **Fix now** |
| TD-9 | Unused `useAllArtifactEditing` (dead code) | Low | minutes | None | **Fix now** |
| TD-2 | `page.tsx` monolithic orchestrator (~860 lines) | High | days | Low | Defer and monitor |
| TD-1 | Duplicated `recordAndCache` | Medium | hours | Low | Fix opportunistically |
| TD-4 | `PersistedWorkspace` bridge layer | Medium | days | Low | Fix opportunistically |
| TD-8 | Dual localStorage keys without cleanup | Medium | hours | Low | Fix opportunistically |
| TD-6 | `EditableSection` direct API calls | Low | hours | Low | Fix opportunistically |
| TD-11 | Dead code in `workspacePersistence.ts` | Low | minutes | None | Fix opportunistically |
| TD-13 | `GraphPanel` prop sprawl (17 props) | Medium | hours | Low | Fix opportunistically |
| TD-14 | Duplicated incremental layout logic | Medium | hours-day | Low | Fix opportunistically |
| TD-15 | `streamLlm` duplicates provider chain | Medium | days | Low | Fix opportunistically |
| TD-5 | Streaming/non-streaming API duality | Medium | days | Low | Carry intentionally |
| TD-10 | `useFieldUpdaters` untyped dynamic keys | Low | hours | None | Carry intentionally |
| TD-12 | Onboarding overlay inline SVGs | Low | hours | None | Carry intentionally |

### Priority actions

1. **Fix TD-3** (`addGraphEdge` stale closure) -- correctness risk, small fix
2. **Fix TD-7** (rename remnants) -- minutes, user-facing
3. **Fix TD-9** (dead code) -- minutes, reduces confusion

### Debt resolved by this diff

For context, this diff resolves or improves the following pre-existing concerns:

1. **No streaming/progress feedback** for formalization resolved by SSE streaming infrastructure (new `streamLlm.ts`, `fetchStreamingApi`, partial-JSON previews)
2. **No inline editing for structured artifacts** resolved by `EditableSection` + `useFieldUpdaters` + `useArtifactEditing`
3. **No graph persistence** resolved by `GraphLayout` type, position tracking in `useGraphLayout`/`useCausalGraphLayout`, and persistence through workspace sessions
4. **No graph editing** resolved by `graphOperations.ts` (pure functions, well-tested) and wiring through `ProofGraph`/`GraphPanel`
5. **"Dialectical Map" naming** mostly resolved by rename to "Balanced Perspectives"
6. **No onboarding flow** resolved by `OnboardingOverlay`
7. **Concurrent artifact generation race conditions** resolved by per-type generation counters in `useArtifactGeneration`
8. **Queue not cancelled on session switch** resolved by `cancelQueue`/`resetQueue` integration in `useWorkspaceSessions`
