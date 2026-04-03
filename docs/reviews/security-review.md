# Security Code Review: feat/graph-persistence-editing

**Branch:** `feat/graph-persistence-editing` relative to `main`
**Scope:** 86 files changed (+6,679 / -1,615 lines) -- full branch diff
**Reviewer:** Claude Opus 4.6 (security review pipeline)
**Date:** 2026-04-03

## Trust Boundary Map

1. **Browser -> Next.js API routes (HTTP):** All `/api/*` POST handlers accept untrusted JSON from the client. Routes: `edit/artifact`, `formalization/lean`, `formalization/semiformal`, `formalization/balanced-perspectives`, `formalization/causal-graph`, `formalization/statistical-model`, `formalization/property-tests`, `formalization/counterexamples`, `decomposition/extract`. Input is destructured from `request.json()` with minimal validation (typically just checking `sourceText` or `content` is truthy).

2. **API routes -> LLM providers (outbound HTTP):** User-supplied text is interpolated into LLM prompts and sent to Anthropic or OpenRouter. API keys (`ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`) are read from `process.env` and passed as `Authorization` headers.

3. **LLM responses -> API response (downstream):** LLM output is parsed (JSON or raw text), post-processed (`stripCodeFences`, `stripImports`), and returned to the client. For artifact editing (`edit/artifact`), LLM-returned text is validated as JSON for whole-edit mode; inline-edit mode returns unvalidated text.

4. **API routes -> filesystem (cache + analytics):** LLM responses are cached to `data/cache/{sha256-hash}.json`. Analytics entries are appended to `data/analytics.jsonl`. Both use filesystem I/O with paths derived from deterministic hashing.

5. **SSE streaming boundary:** `streamLlm.ts` produces SSE events (token, done, error) via `ReadableStream`. The lean route adds a `TransformStream` that re-parses SSE events mid-stream. Client-side `fetchStreamingApi` reads and parses these events.

6. **localStorage -> Zustand store:** Covered in prior review (loop 2). Deserialization is validated via `coercePersistedState`.

7. **Puppeteer in scripts:** `load-example-workspace.mjs` optionally launches a headless browser to inject localStorage data.

## Findings

#### 1. LLM response fragment leaked in 502 error responses
**Severity:** Low
**Location:** `app/api/edit/artifact/route.ts:80-83`, `app/lib/formalization/artifactRoute.ts:106-109`
**Move:** Check the error path, not just the happy path
**Confidence:** Medium

When the LLM returns invalid JSON, the 502 error response includes `details: responseText.slice(0, 500)`. This leaks up to 500 characters of raw LLM output to the client. In this single-user app the client is also the user, so the risk is minimal. However, if the app were ever exposed to multiple users or if the LLM hallucinates content that includes fragments from its training data, this error detail could inadvertently leak information.

**Recommendation:** Consider returning a generic error message to the client and only logging the LLM response server-side (which is already done via `console.error`). This is defense-in-depth, not an active vulnerability.

#### 2. No request body size limits on API routes
**Severity:** Medium
**Location:** All `app/api/*/route.ts` POST handlers
**Move:** Ask "what if there are a million of these?"
**Confidence:** Medium

None of the API routes validate the size of the incoming request body. A client (or attacker with network access) could POST an arbitrarily large JSON body, causing memory exhaustion on the server. The `content` field in `edit/artifact` and `sourceText` in formalization routes are passed directly to LLM prompts, which have token limits -- but the server still parses and holds the full string in memory before the LLM call.

Next.js has a default body size limit of 1MB for API routes (`bodyParser.sizeLimit`), which provides some protection. However, for the streaming routes where the body is read via `request.json()` (not the body parser), this limit may not apply.

**Recommendation:** Add explicit length checks on user-provided text fields (e.g., reject `content` or `sourceText` > 500KB) in the API routes. This prevents abuse and also avoids sending excessively large prompts to the LLM.

#### 3. OpenRouter API key sent without scope restrictions
**Severity:** Low
**Location:** `app/lib/llm/streamLlm.ts:224-228`, `app/lib/llm/callLlm.ts:171-178`
**Move:** Follow the secrets
**Confidence:** Medium

The `OPENROUTER_API_KEY` is used as a Bearer token for both non-streaming and streaming calls. The key appears to have full account access (model selection, usage). If this key is leaked (e.g., via a server-side error that includes headers, or log aggregation), it could be used to make arbitrary LLM calls on the account.

This is inherent to the OpenRouter API design and not a code-level bug. The Anthropic SDK client is similarly instantiated with the full API key.

**Recommendation:** Ensure `.env.local` is in `.gitignore` (it is, via Next.js defaults). Consider setting spending limits on the OpenRouter account. No code change needed.

#### 4. Analytics data committed to repository
**Severity:** Low
**Location:** `data/analytics.jsonl` (68 new lines)
**Move:** Follow the secrets
**Confidence:** High

The `data/` directory is in `.gitignore`, but `data/analytics.jsonl` was committed in this branch's history (visible in the diff). This file contains usage data including endpoints, models, token counts, costs, and timestamps. While this does not contain API keys or user content, it reveals infrastructure details (model choices, cost structure, usage patterns).

**Recommendation:** Remove `data/analytics.jsonl` from the branch before merging. If it was committed intentionally for the example workspace, move it to a non-tracked location or document why it is tracked.

#### 5. SSE stream transform assumes single-event chunks
**Severity:** Low
**Location:** `app/api/formalization/lean/route.ts:100-138` (TransformStream)
**Move:** Check the error path, not just the happy path
**Confidence:** Medium

The lean route's `TransformStream` splits incoming chunks on `\n\n` and attempts to regex-match each block as `^event: (\w+)\ndata: ([\s\S]+)$`. If the upstream SSE encoder produces a chunk that spans multiple events or splits an event across chunks, the regex will fail and the fallback re-enqueues the original `chunk` bytes. This could result in duplicate or malformed SSE events being sent to the client.

This is a correctness issue rather than a security vulnerability. The SSE encoder (`sseEvent()`) always produces complete events, so in practice chunks align with events. However, the Node.js stream backpressure system does not guarantee this.

**Recommendation:** Buffer incomplete events across `transform` calls (similar to the line-buffering in `streamOpenRouter`) rather than falling back to re-enqueuing the raw chunk.

#### 6. Anthropic client singleton ignores key changes
**Severity:** Informational
**Location:** `app/lib/llm/callLlm.ts:11-17`
**Move:** Trace the trust boundaries
**Confidence:** High

`getAnthropicClient` caches the first Anthropic SDK client instance and reuses it forever, regardless of whether `apiKey` changes. If `ANTHROPIC_API_KEY` were rotated while the server is running, the old key would continue to be used. This is pre-existing behavior (not introduced in this branch), now exported for use by `streamLlm.ts` as well.

**Recommendation:** Either invalidate the cached client when the key changes, or document that key rotation requires a server restart.

#### 7. Inline edit applies replacement at character offsets without re-validation
**Severity:** Low
**Location:** `app/hooks/useArtifactEditing.ts:47-49`
**Move:** Identify time-of-check to time-of-use gaps
**Confidence:** Low

When performing an inline edit, the client sends `selection.start` and `selection.end` offsets. After the API returns the replacement text, the hook applies it to the current content using string slicing: `content.slice(0, selection.start) + data.text + content.slice(selection.end)`. If the content changed between when the selection was made and when the edit completes (e.g., a concurrent whole-document edit or streaming update), the offsets would be stale, producing corrupted content.

In practice, the UI likely prevents concurrent edits (the editing state blocks other operations). This is more of a UX robustness concern than a security issue.

**Recommendation:** Either lock the content during edit operations (which appears to be the current behavior via `editEndpoint` loading state) or re-validate offsets against current content before applying the splice.

#### 8. `SIMULATE_STREAM_FROM_CACHE` flag available in production
**Severity:** Informational
**Location:** `app/lib/llm/streamLlm.ts:98`
**Move:** Invert the access control model
**Confidence:** Low

The `SIMULATE_STREAM_FROM_CACHE` environment variable enables simulated streaming from cached results. This is a development/testing feature. If set in production, it adds a 15ms delay per 20-character chunk, which could slow responses but is otherwise harmless.

**Recommendation:** Document this as a dev-only flag. Optionally guard it with a `NODE_ENV === 'development'` check.

## What Looks Good

- **API key handling.** API keys are read from environment variables and never logged, returned in responses, or written to cache/analytics. The Anthropic SDK and OpenRouter fetch calls correctly use the keys only in authorization headers.

- **LLM cache uses SHA-256 hashing of deterministic inputs.** Cache keys are derived from `(model, systemPrompt, userContent, maxTokens)` via `createHash("sha256")`. The hash is used as a filename in a fixed directory (`data/cache/`). No path traversal is possible because the hash output is a fixed-length hex string.

- **JSON parse validation on whole-edit responses.** The `edit/artifact` route validates that whole-edit LLM responses are valid JSON before returning them to the client. Invalid responses get a 502 error.

- **Deserialization validation is thorough.** The Zustand store's `merge` function validates every field at every nesting level via `coercePersistedState`, `coerceArtifactRecord`, `coerceArtifactVersion`, and `coerceDecomposition`. This was verified in the prior security review loop.

- **SSE event encoding uses JSON.stringify.** The `sseEvent()` helper serializes data via `JSON.stringify`, preventing injection of SSE control characters into event payloads.

- **Streaming reader properly releases lock.** `fetchStreamingApi` uses `try/finally` with `reader.releaseLock()` to ensure the reader is released even on errors.

- **Error paths return safe status codes.** LLM failures return 502 (Bad Gateway), input validation failures return 400, and internal errors are caught and logged.

- **No `dangerouslySetInnerHTML` or equivalent.** UI components render user content and LLM output via React's JSX text interpolation, which auto-escapes HTML.

- **`stripCodeFences` is safe.** Uses regex matching to extract content from markdown fences. No evaluation of the content. No ReDoS risk from the simple regex pattern.

- **Cache and analytics writes are non-fatal.** All filesystem writes in the LLM call path are wrapped in try/catch blocks so failures do not break the request.

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 1 | LLM response fragment in 502 errors | Low | edit/artifact/route.ts:80, artifactRoute.ts:106 | Medium |
| 2 | No request body size limits | Medium | All API routes | Medium |
| 3 | OpenRouter API key scope | Low | streamLlm.ts:224, callLlm.ts:171 | Medium |
| 4 | Analytics data committed to repo | Low | data/analytics.jsonl | High |
| 5 | SSE transform assumes single-event chunks | Low | formalization/lean/route.ts:100 | Medium |
| 6 | Anthropic client ignores key rotation | Informational | callLlm.ts:11-17 | High |
| 7 | Inline edit offset TOCTOU | Low | useArtifactEditing.ts:47-49 | Low |
| 8 | SIMULATE_STREAM_FROM_CACHE in production | Informational | streamLlm.ts:98 | Low |

## Overall Assessment

The branch introduces a significant amount of new server-side code (streaming LLM infrastructure, artifact editing API, SSE transport) alongside the client-side Zustand migration. The security posture is reasonable for a single-user research tool. API keys are handled correctly, LLM responses are validated before use, deserialization is thorough, and error paths are safe.

The only Medium-severity finding is the lack of request body size limits, which is worth addressing before any multi-user deployment. The Low findings are defense-in-depth improvements. No Critical or High severity issues were found. The committed analytics data (Finding 4) should be cleaned up before merge as a hygiene matter.
