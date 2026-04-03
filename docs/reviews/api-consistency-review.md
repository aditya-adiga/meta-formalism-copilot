# API Consistency Review: feat/graph-persistence-editing

**Reviewer:** Claude (API Consistency)
**Branch:** `feat/graph-persistence-editing` relative to `main`
**Date:** 2026-04-03

---

## Baseline Conventions

Established API patterns in this codebase:

1. **HTTP API routes** are all POST handlers under `app/api/`. Error responses follow `{ error: string, details?: string }` with status 502 for LLM failures and 400 for input validation.

2. **Formalization routes** use `handleArtifactRoute()` from `artifactRoute.ts`, which provides a uniform contract: accept `ArtifactGenerationRequest`, return `{ [responseKey]: parsedData }`. Streaming is opt-in via `{ stream: true }` in the request body.

3. **Edit routes** (`edit/inline`, `edit/whole`) accept `{ fullText, instruction, selection? }` and return `{ text: string }` uniformly for both inline and whole edits. They use `callLlm()` directly (not `handleArtifactRoute`).

4. **Input field naming**: existing edit routes use `fullText` for the document content. Formalization routes use `sourceText`.

5. **Response key convention**: formalization routes wrap output in a typed response key (`causalGraph`, `proof`, `leanCode`, etc.). Edit routes return flat `{ text }`.

6. **Streaming protocol**: SSE with `event: token`, `event: done`, `event: error`. The `done` event includes `{ text, usage }`. Managed by `streamLlm()` and consumed by `fetchStreamingApi()`.

7. **Internal hooks**: feature-specific hooks are thin wrappers over `fetchApi()`/`fetchStreamingApi()`, with state managed in the Zustand `workspaceStore`.

8. **Decision docs**: numbered sequentially under `docs/decisions/NNN-title.md`.

---

## Findings

#### F1. New `edit/artifact` route uses inconsistent response shape for whole vs inline edits

**Severity:** Inconsistent
**Location:** `app/api/edit/artifact/route.ts:56-70`
**Move:** 7 (Look for the asymmetry)
**Confidence:** High

The new `POST /api/edit/artifact` endpoint returns `{ text: string }` for inline edits but `{ content: string }` for whole edits. This is a polymorphic response from a single endpoint, requiring the consumer to know which mode was used to parse the response. The existing `edit/inline` and `edit/whole` routes both return `{ text }` uniformly.

The consumer in `useArtifactEditing.ts` (lines 39 and 48) correctly handles both shapes, but this creates a fragile coupling: any new consumer of `/api/edit/artifact` must implement the same conditional parsing. The existing edit routes established a convention of always returning `{ text }`.

**Recommendation:** Unify the response key to `{ text }` for both inline and whole-artifact edits, matching the existing edit routes. The consumer can distinguish the two modes by whether it needs to do substring replacement (inline) or full replacement (whole).

---

#### F2. New `edit/artifact` route uses `content` as input field name, diverging from `fullText` convention

**Severity:** Minor
**Location:** `app/api/edit/artifact/route.ts:25`
**Move:** 2 (Check naming against the grain)
**Confidence:** Medium

The existing edit routes accept `{ fullText, instruction }` while the new artifact edit route accepts `{ content, instruction }`. The new naming is arguably clearer for JSON artifacts, and it's consumed by new code only (`useArtifactEditing`, `EditableSection`), so there's no breaking change. However, having two naming conventions for "the document being edited" in the same `edit/` route family creates cognitive overhead for contributors.

**Recommendation:** This is establishing a new pattern for structured artifact editing, which is defensible. Consider adding a comment noting that `content` is used (rather than `fullText`) because this route handles JSON artifacts, not prose text.

---

#### F3. `useAllArtifactEditing` is dead code referencing deleted `useWorkspacePersistence`

**Severity:** Inconsistent
**Location:** `app/hooks/useArtifactEditing.ts:69-115`
**Move:** 3 (Trace the consumer contract)
**Confidence:** High

(From Stage 1 fact-check, Claim 17.) The `useAllArtifactEditing` function is exported but never called anywhere in the codebase. Its docstring references `useWorkspacePersistence` which has been deleted on this branch. Its parameter shape (`{ causalGraph: string | null; setCausalGraph: ... }`) matches the old persistence hook's flat-string interface, not the new Zustand store's `ArtifactRecord`-based API. Any future consumer would need to bridge between the store's `getArtifactContent(key)`/`setArtifactEdited(key, ...)` interface and this hook's setter-per-type interface.

**Recommendation:** Remove `useAllArtifactEditing` entirely. The individual `useArtifactEditing` hook is the correct granular abstraction and is already used directly by panel components.

---

#### F4. Lean route's streaming TransformStream has fragile SSE parsing

**Severity:** Inconsistent
**Location:** `app/api/formalization/lean/route.ts:112-143`
**Move:** 4 (Verify error consistency)
**Confidence:** Medium

The lean route implements a custom `TransformStream` to post-process the `done` event from `streamLlm()`. The SSE parsing logic splits on `\n\n` and uses a regex (`/^event: (\w+)\ndata: ([\s\S]+)$/`) to match events. This has two issues:

1. **Chunking assumption**: SSE events from `sseEvent()` are formatted as `event: X\ndata: Y\n\n`. If a TCP chunk boundary falls mid-event, the `split("\n\n")` will produce partial blocks that fail the regex, and the fallback `controller.enqueue(chunk)` will emit raw bytes that are not valid SSE.

2. **Pattern divergence**: All other artifact routes using streaming delegate entirely to `handleArtifactRoute()` + `streamLlm()`, which handles the SSE lifecycle cleanly. The lean route's custom transform is the only place that re-parses its own server's SSE output. This is because lean needs post-processing (`stripCodeFences`, `stripImports`), but the same need could arise for other routes.

**Recommendation:** Consider extending `streamLlm()` or `handleArtifactRoute()` with an optional `transformFinalText` callback, so the lean route can inject its post-processing without re-parsing SSE. Short-term, add a comment noting the chunking assumption and why it's acceptable (single-process server, events are small).

---

#### F5. Duplicate decision doc numbering: two `005-*` files

**Severity:** Minor
**Location:** `docs/decisions/005-streaming-api-responses.md`, `docs/decisions/005-zustand-state-management.md`
**Move:** 2 (Check naming against the grain)
**Confidence:** High

Two decision documents share the `005` prefix. The established convention is sequential unique numbering. This also occurs at the `001` level (`001-formal-artifact-types.md` and `001-vitest-test-framework.md`), suggesting a recurring coordination issue.

**Recommendation:** Renumber one of the 005 docs (e.g., Zustand to 006) to restore unique ordering.

---

#### F6. `CLAUDE.md` references deleted `useWorkspacePersistence` hook

**Severity:** Minor
**Location:** `CLAUDE.md` (hooks section, architecture section)
**Move:** 3 (Trace the consumer contract)
**Confidence:** High

(From Stage 1 fact-check, Claims 14-16.) The CLAUDE.md architecture section lists `useWorkspacePersistence` in the hooks directory and describes state persistence as "persisted to localStorage via `useWorkspacePersistence`". This hook has been deleted and replaced by the Zustand `workspaceStore`. Developer documentation drift is an API consistency issue for internal interfaces -- contributors following CLAUDE.md will look for a hook that doesn't exist.

**Recommendation:** Update CLAUDE.md to reference `workspaceStore` and the Zustand-based persistence layer.

---

#### F7. Lean route lacks input validation, inconsistent with `edit/artifact` and `artifactRoute`

**Severity:** Minor
**Location:** `app/api/formalization/lean/route.ts:74-76`
**Move:** 6 (Verify error consistency)
**Confidence:** Medium

The lean route destructures `informalProof` from the request body but never validates it. If `informalProof` is missing or empty, the route will send an empty string to the LLM and return whatever it generates. By contrast, `handleArtifactRoute` validates `sourceText` with a 400 response, and the new `edit/artifact` route validates `content` and `instruction`. This is a pre-existing gap (present on main), but the branch adds streaming support that also lacks validation, widening the impact surface.

**Recommendation:** Add a guard `if (!informalProof) return NextResponse.json({ error: "informalProof is required" }, { status: 400 })` before the streaming and non-streaming paths, consistent with the validation pattern in `artifactRoute.ts`.

---

#### F8. `hardcoded validKeys` in `coercePersistedState` lists `dialectical-map` instead of `balanced-perspectives`

**Severity:** Inconsistent
**Location:** `app/lib/stores/workspaceStore.ts:120-121`
**Move:** 2 (Check naming against the grain)
**Confidence:** High

The `validKeys` array in `coercePersistedState` was noted in the prior review (F4) as duplicating the `ArtifactKey` type. This branch renames `dialectical-map` to `balanced-perspectives` across the codebase, but the hardcoded array in `coercePersistedState` may still contain the old name. Let me verify...

Actually, re-reading the store code at line 121, the array reads: `["causal-graph", "statistical-model", "property-tests", "balanced-perspectives", "counterexamples"]` -- this appears correct. The prior review's F4 listed `dialectical-map` because it was written before the rename. This finding is **withdrawn** -- the rename was applied correctly here.

---

## What Looks Good

1. **New `edit/artifact` route follows the established error handling pattern.** The `OpenRouterError` catch, 502 status for LLM failures, and `{ error, details }` shape all match `edit/inline` and `edit/whole` exactly.

2. **`fetchApi` and `fetchStreamingApi` provide clean abstractions.** The new `api.ts` module centralizes HTTP concerns (JSON serialization, error extraction, SSE parsing) so that hook consumers don't duplicate fetch boilerplate. The streaming API transparently adds `{ stream: true }` to the body.

3. **Streaming SSE protocol is consistent.** The `streamLlm()` function emits the same `token`/`done`/`error` event types as the non-streaming `callLlm()` returns `{ text, usage }`. The `fetchStreamingApi` consumer correctly handles all three event types.

4. **`ArtifactGenerationRequest` is a well-designed uniform contract.** All formalization routes now accept the same request shape, with `transformBody` for backward compatibility where needed (e.g., semiformal's legacy `{ text }` field).

5. **Artifact type maps (`ARTIFACT_ROUTE`, `ARTIFACT_RESPONSE_KEY`) are consistent.** Every structured artifact type has entries in both maps, and the `responseKey` matches the actual JSON key returned by each route.

6. **`useFieldUpdaters` hook cleanly centralizes the spread-serialize pattern.** Panel components can update individual fields without duplicating `JSON.stringify({ ...data, [key]: value })` logic.

7. **Zustand store's versioned artifact API (`setArtifactGenerated`, `setArtifactEdited`, `undoArtifact`, `redoArtifact`) is symmetric and well-typed.** The `ArtifactVersion.source` discriminant (`generated` / `ai-edit` / `manual-edit`) cleanly separates provenance.

---

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| F1 | `edit/artifact` returns `{ text }` or `{ content }` depending on mode | Inconsistent | `api/edit/artifact/route.ts:56-70` | High |
| F2 | `edit/artifact` uses `content` instead of `fullText` for input | Minor | `api/edit/artifact/route.ts:25` | Medium |
| F3 | `useAllArtifactEditing` is dead code with stale docstring | Inconsistent | `hooks/useArtifactEditing.ts:69-115` | High |
| F4 | Lean streaming TransformStream re-parses own SSE with fragile chunking | Inconsistent | `api/formalization/lean/route.ts:112-143` | Medium |
| F5 | Duplicate decision doc number (two `005-*` files) | Minor | `docs/decisions/005-*.md` | High |
| F6 | CLAUDE.md references deleted `useWorkspacePersistence` | Minor | `CLAUDE.md` | High |
| F7 | Lean route lacks input validation (pre-existing, widened) | Minor | `api/formalization/lean/route.ts:74-76` | Medium |

---

## Overall Assessment

The branch introduces well-structured API additions (artifact editing route, streaming infrastructure, Zustand store with versioning) that are largely consistent with established codebase conventions. Error handling, response shapes, and the SSE streaming protocol follow existing patterns.

The most significant API consistency issue is **F1** (polymorphic response shape in `edit/artifact`), which forces consumers to handle two different response keys from the same endpoint. This should be unified before merge. **F3** (dead code) and **F4** (fragile SSE re-parsing in the lean streaming path) are secondary consistency concerns that should be addressed but don't block the PR. The documentation drift items (F5, F6) are straightforward to fix.

**Verdict:** Request changes on F1 (response shape inconsistency) and F3 (dead code removal). The remaining findings are minor improvements that can be addressed in the same PR or a follow-up.
