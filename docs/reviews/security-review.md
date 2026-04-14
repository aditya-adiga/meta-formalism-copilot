# Security Code Review: feat/graph-persistence-editing

**Branch:** `feat/graph-persistence-editing` relative to `feat/zustand-wire-page`
**Scope:** 87 files changed (+6,376 / -1,827 lines) -- incremental diff
**Reviewer:** Claude Opus 4.6 (security review pipeline)
**Date:** 2026-04-03

## Trust Boundary Map

1. **Browser -> Next.js API routes (HTTP):** All `/api/*` POST handlers accept untrusted JSON from the client. New in this branch: `edit/artifact` accepts `content` (arbitrary JSON string), `instruction` (free text), and `selection` (character offsets). Existing formalization routes now accept an additional `stream: true` flag that switches to SSE streaming responses.

2. **API routes -> LLM providers (outbound HTTP):** User-supplied text is interpolated into LLM prompts and sent to Anthropic or OpenRouter. The `edit/artifact` route sends the full JSON artifact content plus user instructions to DeepSeek Chat via OpenRouter. API keys (`ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`) are read from `process.env`.

3. **LLM responses -> API response (downstream):** LLM output is parsed and returned to the client. For `edit/artifact` whole mode, JSON validity is checked. For inline mode, raw LLM text is returned without validation. Streaming responses emit SSE events with partial text.

4. **API routes -> filesystem (cache + analytics):** LLM responses are cached to `data/cache/{sha256-hash}.json`. Analytics entries appended to `data/analytics.jsonl`. Both use deterministic hashing for filenames.

5. **SSE streaming boundary:** `streamLlm.ts` produces SSE events via `ReadableStream`. Client-side `fetchStreamingApi` reads and parses these events. `sseEvent()` uses `JSON.stringify` for data serialization.

6. **localStorage -> Zustand store:** Deserialization is validated via `coercePersistedState`. New in this branch: `graphLayout` (positions + viewport) is deserialized with field-level type checking in `coerceDecomposition`.

7. **Client-side graph editing:** User drag, connect, delete, and rename operations go through pure functions in `graphOperations.ts` that operate on in-memory state. No network calls for graph structure changes.

8. **Section-level AI editing (EditableSection):** User text is serialized to JSON, sent to `/api/edit/artifact`, and the LLM response replaces the edited section. The user must explicitly click Save to commit changes.

## Findings

#### 1. No request body size limits on API routes
**Severity:** Medium
**Location:** All `app/api/*/route.ts` POST handlers
**Move:** Scale attacks -- what if there are a million of these?
**Confidence:** Medium

None of the API routes validate the size of the incoming request body. The `content` field in `edit/artifact` and `sourceText` in formalization routes are passed directly to LLM prompts. A client could POST an arbitrarily large JSON body. Next.js has a default 1MB body parser limit, but streaming routes that use `request.json()` directly may bypass this.

**Recommendation:** Add explicit length checks on user-provided text fields (e.g., reject `content` or `sourceText` > 500KB). This prevents memory exhaustion and avoids sending excessively large prompts to the LLM.

#### 2. `addGraphEdge` reads stale state due to React batching
**Severity:** Low
**Location:** `app/hooks/useDecomposition.ts:147-156`
**Move:** Time-of-check to time-of-use gaps
**Confidence:** High

`addGraphEdge` reads `state.nodes` from the closure to call `addEdgeOp()`, then calls `setState` with the result. The comment acknowledges this: "Read state directly to avoid React 18 batching race." However, this is backwards -- reading from the closure is the problem, not the solution. Between the cycle check (`addEdgeOp(state.nodes, ...)`) and the `setState` call, another state update (e.g., a node deletion triggered by a concurrent user action) could have changed the node array. The cycle check would pass against stale data, and the resulting `setState` would overwrite the intermediate update.

In a single-user desktop app with no concurrent operations, the window is extremely narrow. But the pattern is still incorrect: the `addEdgeOp` should be called inside the `setState` updater function, not outside it. The return value problem (needing to return a boolean synchronously) is a real constraint, but the current approach trades correctness for convenience.

The practical impact is low because: (a) the user cannot trigger two graph mutations in the same React render cycle through normal UI interaction, and (b) even if they could, the worst case is a cycle being introduced, which would be visible in the graph and correctable.

**Recommendation:** Refactor to use a ref for the latest nodes (e.g., `nodesRef.current = state.nodes` in a `useEffect`), or move the cycle check inside the `setState` updater and use a ref or callback to communicate the boolean result.

#### 3. Inline edit in `useArtifactEditing` applies LLM replacement at stale character offsets
**Severity:** Low
**Location:** `app/hooks/useArtifactEditing.ts:44-49`
**Move:** Time-of-check to time-of-use gaps
**Confidence:** Low

When performing an inline edit, the client captures `selection.start` and `selection.end` at invocation time, sends them to the API, then applies the replacement to `getContent()` at response time. If content changed between invocation and response (e.g., a streaming update, a concurrent whole-document edit, or a manual edit in another section), the offsets would be stale, producing corrupted JSON.

The `editing` boolean state likely prevents concurrent operations in the UI, making this a theoretical concern. But the pattern of capturing offsets before an async operation and applying them after is inherently fragile.

**Recommendation:** Either snapshot the content at invocation time and compare with current content before applying (rejecting if changed), or re-validate that the original selection text still exists at the expected offsets.

#### 4. LLM response fragment leaked in 502 error responses
**Severity:** Low
**Location:** `app/api/edit/artifact/route.ts:95-99`, `app/lib/formalization/artifactRoute.ts:106-109`
**Move:** Check error paths
**Confidence:** Medium

When the LLM returns invalid JSON, the 502 error response includes `details: responseText.slice(0, 500)`. This leaks up to 500 characters of raw LLM output to the client. In this single-user app the risk is minimal, but if the LLM hallucinates content from its training data, this could inadvertently expose information.

**Recommendation:** Return a generic error message to the client and only log the LLM response server-side (which is already done via `console.error`).

#### 5. Analytics data committed to repository
**Severity:** Low
**Location:** `data/analytics.jsonl` (68 new lines in diff)
**Move:** Follow the secrets
**Confidence:** High

The diff shows 68 lines of analytics data including endpoints, models, token counts, costs, and timestamps. While `data/` is in `.gitignore`, this data was committed in a branch commit. It reveals infrastructure details (model choices, cost structure, usage patterns).

**Recommendation:** Remove `data/analytics.jsonl` from the branch before merging. If committed intentionally for the example workspace, move it to a non-tracked location.

#### 6. OpenRouter API key sent without scope restrictions
**Severity:** Low
**Location:** `app/lib/llm/streamLlm.ts:224-228`, `app/lib/llm/callLlm.ts:171-178`
**Move:** Follow the secrets
**Confidence:** Medium

The `OPENROUTER_API_KEY` is used as a Bearer token for both streaming and non-streaming calls with full account access. Key leakage (e.g., via error logging or aggregation) would allow arbitrary LLM calls. This is inherent to the API design, not a code-level bug. The new `streamLlm.ts` now also uses this key, expanding the call surface.

**Recommendation:** Ensure `.env.local` is in `.gitignore` (it is). Set spending limits on the OpenRouter account.

#### 7. `EditableSection` AI edit sends full artifact JSON to DeepSeek Chat
**Severity:** Low
**Location:** `app/components/features/output-editing/EditableSection.tsx:83-88`
**Move:** Trace trust boundaries
**Confidence:** Medium

When a user triggers an AI edit on a section, the `EditableSection` component sends the full JSON artifact content (not just the selected section) to `/api/edit/artifact`, which forwards it to DeepSeek Chat via OpenRouter. This means the full artifact content -- which may contain formalized versions of sensitive source material -- is sent to a third-party LLM provider (DeepSeek) even when the user only intended to edit one field.

In a single-user research tool, the user presumably consents to LLM processing of their content. But the implicit data flow -- clicking "Edit with AI" on a single field sends the entire document to a different provider than the one used for generation -- may surprise users.

**Recommendation:** Document which LLM provider is used for editing vs. generation. Consider whether section-level edits could send only the section content rather than the full artifact.

#### 8. Anthropic client singleton ignores key changes
**Severity:** Informational
**Location:** `app/lib/llm/callLlm.ts:11-17`
**Move:** Trace trust boundaries
**Confidence:** High

`getAnthropicClient` caches the first SDK client instance and reuses it regardless of whether `apiKey` changes. Now exported for use by both `callLlm` and `streamLlm`. If `ANTHROPIC_API_KEY` were rotated while the server is running, the old key would continue to be used.

**Recommendation:** Document that key rotation requires a server restart.

#### 9. `SIMULATE_STREAM_FROM_CACHE` flag available in production
**Severity:** Informational
**Location:** `app/lib/llm/streamLlm.ts:98`
**Move:** Invert access control
**Confidence:** Low

The `SIMULATE_STREAM_FROM_CACHE` environment variable enables simulated streaming from cached results. If set in production, it adds a 15ms delay per 20-character chunk, which could degrade performance but is otherwise harmless.

**Recommendation:** Guard with a `NODE_ENV === 'development'` check.

#### 10. Graph layout deserialization lacks bounds checking on position values
**Severity:** Informational
**Location:** `app/lib/utils/workspacePersistence.ts:136-166`
**Move:** Find implicit sanitization assumptions
**Confidence:** Low

The `coerceDecomposition` function validates that `graphLayout.positions` values have numeric `x` and `y` fields, but does not check for `NaN`, `Infinity`, or extremely large values. If corrupted localStorage data contained `{ x: Infinity, y: NaN }`, ReactFlow would receive invalid coordinates.

The practical impact is negligible -- ReactFlow handles edge cases in positioning gracefully, and the only source of this data is the user's own localStorage. But the validation is incomplete relative to the thorough coercion applied elsewhere.

**Recommendation:** Add `Number.isFinite()` checks alongside the `typeof val.x === "number"` checks. This is defense-in-depth.

## What Looks Good

- **API key handling.** API keys are read from environment variables and never logged, returned in responses, or written to cache/analytics. Both `callLlm` and the new `streamLlm` correctly use keys only in authorization headers.

- **LLM cache uses SHA-256 hashing of deterministic inputs.** Cache keys are derived from `(model, systemPrompt, userContent, maxTokens)`. The hash output is a fixed-length hex string, so no path traversal is possible.

- **JSON parse validation on whole-edit responses.** The `edit/artifact` route validates that whole-edit LLM responses are valid JSON before returning to the client. Invalid responses get a 502 error with server-side logging.

- **Deserialization validation is thorough.** The Zustand store's `merge` function validates every field at every nesting level. The new `graphLayout` deserialization in `coerceDecomposition` follows the same careful pattern: checking `isObject`, then checking individual field types before accepting.

- **SSE event encoding uses JSON.stringify.** The `sseEvent()` helper serializes data via `JSON.stringify`, preventing injection of SSE control characters.

- **Streaming reader properly releases lock.** `fetchStreamingApi` uses `try/finally` with `reader.releaseLock()`.

- **No `dangerouslySetInnerHTML`.** All user content and LLM output are rendered via React JSX text interpolation, which auto-escapes HTML. The new `EditableSection` component renders user-editable JSON in a `<textarea>`, not as HTML.

- **Graph operations are pure functions with cycle detection.** `graphOperations.ts` implements `wouldCreateCycle` using DFS before adding edges. All mutation functions are pure (input -> output) and independently testable. The test suite covers cycle detection, duplicate edges, and missing nodes.

- **Section editing requires explicit user action.** `EditableSection` shows editable content only after the user clicks "Edit", and changes are applied only when the user clicks "Save". There is no auto-save that could silently corrupt data.

- **Cache and analytics writes are non-fatal.** All filesystem writes in the LLM call path are wrapped in try/catch blocks.

- **`stripCodeFences` is safe.** Uses simple regex matching, no evaluation, no ReDoS risk.

- **Error paths return appropriate status codes.** LLM failures return 502, input validation failures return 400, and internal errors are caught and logged.

- **Migration handles rename gracefully.** `loadWorkspace` falls back from `balancedPerspectives` to `dialecticalMap` during deserialization, handling the rename without data loss.

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 1 | No request body size limits | Medium | All API routes | Medium |
| 2 | `addGraphEdge` reads stale state | Low | useDecomposition.ts:147-156 | High |
| 3 | Inline edit offset TOCTOU | Low | useArtifactEditing.ts:44-49 | Low |
| 4 | LLM response fragment in 502 errors | Low | edit/artifact/route.ts:95, artifactRoute.ts:106 | Medium |
| 5 | Analytics data committed to repo | Low | data/analytics.jsonl | High |
| 6 | OpenRouter API key scope | Low | streamLlm.ts:224, callLlm.ts:171 | Medium |
| 7 | Full artifact sent to DeepSeek for section edits | Low | EditableSection.tsx:83-88 | Medium |
| 8 | Anthropic client ignores key rotation | Informational | callLlm.ts:11-17 | High |
| 9 | SIMULATE_STREAM_FROM_CACHE in production | Informational | streamLlm.ts:98 | Low |
| 10 | Graph layout positions lack bounds checking | Informational | workspacePersistence.ts:136-166 | Low |

## Re-review (Loop 2)

**Date:** 2026-04-03
**Scope:** `git diff HEAD~1` (fix commit for A1 finding)

### A1 Re-check: `addGraphEdge` stale state (Finding 2)

**Status: FIXED**

The fix applies the recommended `nodesRef.current` pattern. `nodesRef` is updated synchronously during render (`nodesRef.current = state.nodes` at the top of `useDecomposition`), which is the standard React idiom for keeping refs in sync with state. `addGraphEdge` now reads `nodesRef.current` instead of the closure-captured `state.nodes`, eliminating the stale-closure problem.

**Residual note:** A narrow TOCTOU window remains: between `addEdgeOp(nodesRef.current, ...)` and the `setState` call, the `setState` updater uses the pre-computed `result` rather than `prev.nodes`, so a concurrent mutation would be overwritten. This is the same class of issue noted in the original review but with a much smaller window. Severity remains Low with negligible practical impact in single-user usage. No action needed.

### Other changes in this commit

- `graphOperations.ts`: JSDoc comment corrections only (no logic changes).
- `artifactRoute.ts`: Added clarifying comment about streaming vs. batch JSON schema enforcement (no logic changes).
- Review documents updated.

**No new security issues introduced by this fix commit.**

## Overall Assessment

The branch introduces graph persistence and editing (node add/delete/rename, edge add/delete with cycle detection, position persistence), section-level inline editing with AI assistance, SSE streaming for LLM responses, and a rename of dialectical-map to balanced-perspectives.

The security posture is reasonable for a single-user research tool. No Critical or High severity issues were found. The sole Medium finding (request body size limits) carries over from the prior review. The new Low finding about `addGraphEdge` stale state (Finding 2) is the most architecturally interesting: it is a genuine TOCTOU bug where the cycle check runs against a potentially outdated node array, but the practical exploit window is negligible in single-user usage. The implicit data flow in section editing (Finding 7) -- where editing one field sends the entire artifact to a third-party LLM -- is worth documenting for user transparency.

The graph operations layer (`graphOperations.ts`) is well-designed from a security perspective: pure functions, no side effects, cycle detection before mutation, comprehensive test coverage. The deserialization path for graph layout follows established validation patterns.
