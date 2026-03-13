# Refactoring Plan: Code Simplification Pass

Generated from automated code review of `main`..`dev` diff (109 files, ~19k lines).

## Branch Strategy

Each item gets its own `refactor/` feature branch off `dev`, merged back into `dev` after completion. Items are ordered by dependency (earlier items unblock later ones) and risk (safest first).

---

## 1. `refactor/consolidate-verification-status`

**Problem:** `VerificationStatus` type (`"none" | "verifying" | "valid" | "invalid"`) is defined independently in 6 files. `NodeVerificationStatus` (`"unverified" | "in-progress" | "verified" | "failed"`) is a parallel vocabulary with ad-hoc mapping ternaries in 2+ places.

**Files:**
- `app/hooks/useFormalizationPipeline.ts:7`
- `app/hooks/useWorkspacePersistence.ts:7`
- `app/lib/utils/workspacePersistence.ts:5`
- `app/components/panels/OutputPanel.tsx:8`
- `app/components/features/lean-display/LeanCodeDisplay.tsx:6`
- `app/components/panels/LeanPanel.tsx:8`
- `app/lib/types/decomposition.ts:9-13` (NodeVerificationStatus)
- `app/page.tsx:118-121` and `app/hooks/useActiveArtifactState.ts:40-44` (mapping)

**Plan:**
1. Define canonical `VerificationStatus` in `app/lib/types/session.ts`
2. Add `toNodeVerificationStatus()` / `fromNodeVerificationStatus()` mapping functions
3. Replace all 6 local definitions with imports
4. Replace ad-hoc mapping ternaries with the mapping functions

**Risk:** Low. Pure type + import changes. Lint will catch any misses.

---

## 2. `refactor/cache-toctou-and-anthropic-client`

**Problem:**
- `cache.ts`: `ensureCacheDir` calls `existsSync` before `mkdirSync` on every write; `getCachedResult` checks `existsSync` before reading. Both are TOCTOU anti-patterns.
- `callLlm.ts`: `new Anthropic()` is instantiated on every call instead of being reused.

**Files:**
- `app/lib/llm/cache.ts:26-29, 40-41`
- `app/lib/llm/callLlm.ts:80`

**Plan:**
1. `cache.ts`: Use `mkdirSync(dir, { recursive: true })` unconditionally; remove `existsSync` pre-check on read (catch `ENOENT` in existing catch block)
2. `callLlm.ts`: Lazy-initialize Anthropic client at module scope

**Risk:** Low. Internal implementation changes, no API surface changes.

---

## 3. `refactor/lean-error-use-callLlm`

**Problem:** `lean-error/route.ts` manually reimplements the Anthropic-then-OpenRouter-then-mock fallback chain that `callLlm()` already provides. Misses caching and cost tracking.

**Files:**
- `app/api/explanation/lean-error/route.ts`

**Plan:**
1. Replace manual LLM calls with a single `callLlm()` invocation
2. Remove duplicated provider-selection logic

**Risk:** Low. The route's external API (request/response shape) stays the same. Depends on item 2 being done first (Anthropic client fix).

---

## 4. `refactor/strip-code-fences-utility`

**Problem:** `extractJson()` in `artifactRoute.ts` and `extractLeanCode()` in `lean/route.ts` both strip markdown code fences using nearly identical regex.

**Files:**
- `app/lib/formalization/artifactRoute.ts:~30`
- `app/api/formalization/lean/route.ts:~60`

**Plan:**
1. Create `stripCodeFences(raw: string): string` in `app/lib/utils/`
2. Replace both implementations with calls to the shared utility

**Risk:** Low.

---

## 5. `refactor/debounce-session-persistence`

**Problem:** `useFormalizationSessions` writes all sessions to localStorage on every state change (verification status updates, lean code changes) without debouncing. During pipeline runs this fires rapidly, blocking the main thread with `JSON.stringify`.

**Files:**
- `app/hooks/useFormalizationSessions.ts:38-44`

**Plan:**
1. Add 500ms debounced save (matching `useWorkspacePersistence` pattern)
2. Ensure save fires on unmount to avoid data loss

**Risk:** Low-medium. Need to verify no downstream code depends on synchronous persistence.

---

## 6. `refactor/workspace-persistence-stability`

**Problem:** `useWorkspacePersistence` has cascading issues: `persistDecompState` gets new identity on every state change (deps include `[state, artifactData]`), causing downstream effects to re-fire. `saveWorkspace` takes 10 positional parameters.

**Files:**
- `app/hooks/useWorkspacePersistence.ts`
- `app/lib/utils/workspacePersistence.ts:39-50`

**Plan:**
1. Change `saveWorkspace` to accept a single object parameter
2. Use refs for state in save functions so `persistDecompState` has stable identity
3. Extract shared `scheduleSave()` helper for the duplicated debounce logic

**Risk:** Medium. Touches persistence layer; must verify save/restore round-trip still works.

---

## 7. `refactor/artifact-response-key-map`

**Problem:** `useArtifactGeneration.ts` has a ternary chain mapping artifact types to response keys, duplicating knowledge from route configs.

**Files:**
- `app/hooks/useArtifactGeneration.ts:58-62`
- `app/lib/types/artifacts.ts`

**Plan:**
1. Add `ARTIFACT_RESPONSE_KEY: Record<ArtifactType, string>` to `app/lib/types/artifacts.ts`
2. Replace ternary chain with lookup

**Risk:** Low.

---

## 8. `refactor/semiformal-use-artifact-route`

**Problem:** Semiformal API route hand-rolls the same logic `handleArtifactRoute` provides (message construction, LLM call, error handling).

**Files:**
- `app/api/formalization/semiformal/route.ts`
- `app/lib/formalization/artifactRoute.ts`

**Plan:**
1. Extend `handleArtifactRoute` with a `parseResponse` option for non-JSON responses
2. Refactor semiformal route to use `handleArtifactRoute`

**Risk:** Low-medium. Need to verify semiformal output format is preserved.

---

## 9. `refactor/panel-shell-component`

**Problem:** 6+ panel components duplicate identical header/empty-state/loading-state boilerplate (~20 lines each).

**Files:**
- `CausalGraphPanel.tsx`, `DialecticalMapPanel.tsx`, `StatisticalModelPanel.tsx`, `PropertyTestsPanel.tsx`, `LeanPanel.tsx`, `SemiformalPanel.tsx`

**Plan:**
1. Create `<ArtifactPanelShell title loading data emptyMessage>` component
2. Refactor each panel to use the shell, keeping only unique content rendering

**Risk:** Low. Pure UI extraction; visual output should be identical.

---

## 10. `refactor/unify-generate-handlers`

**Problem:** `handleGenerate` and `handleNodeGenerate` in `page.tsx` are near-duplicates (~100 lines of shared logic).

**Files:**
- `app/page.tsx:326-423`

**Plan:**
1. Extract `executeGeneration(text, context, artifactTypes, nodeId?, nodeLabel?)` helper
2. Reduce both handlers to thin wrappers

**Risk:** Medium. Core generation flow; must test manually.

---

## 11. `refactor/unify-retry-loop`

**Problem:** `formalizeNode.ts` and `useFormalizationPipeline.ts` both implement the same generate-verify-retry loop with `MAX_LEAN_ATTEMPTS = 3`.

**Files:**
- `app/lib/formalization/formalizeNode.ts:30-70`
- `app/hooks/useFormalizationPipeline.ts:55-105`

**Plan:**
1. Extract core retry loop into shared function accepting state-update callbacks
2. Have both callers delegate to it

**Risk:** Medium. Core business logic; needs careful testing.

---

## 12. `refactor/pdf-parser-efficiency`

**Problem:**
- `identifyPropositionHeaders` called twice (once inside `isPdfTexCompiled`, once directly)
- Pages extracted sequentially when they could be parallel

**Files:**
- `app/lib/utils/pdfPropositionParser.ts:505-510, 446-481`

**Plan:**
1. Call `identifyPropositionHeaders` once, check `boldHeaders.length >= 2` inline
2. Use `Promise.all` for parallel page extraction

**Risk:** Low. Has existing tests.

---

## 13. `refactor/panel-content-memo-split`

**Problem:** `panelContent` useMemo in `page.tsx` creates JSX for all panels on any dependency change, even though only one panel is visible.

**Files:**
- `app/page.tsx:489-615`

**Plan:**
1. Split into per-panel memos or render only the active panel
2. Reduce dependency arrays accordingly

**Risk:** Medium. Must verify panel switching still works smoothly.

---

## Deferred (not worth a branch)

- **SemiformalPanel inline fetches vs `fetchApi`** — minor, can be done opportunistically
- **`selectAndRestore` stale closure** — correctness edge case, low probability
- **`isAnyGenerating` / `activeSession` memoization** — micro-optimization
- **Double `JSON.stringify` in `storeArtifactResults`** — minor
- **Section heading / item card extraction** — cosmetic
- **Export graph `dataUrl-to-blob` duplication** — minor
