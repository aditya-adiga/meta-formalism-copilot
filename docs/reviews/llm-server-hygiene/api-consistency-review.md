# API Consistency Review — feat/llm-server-hygiene

**Repository:** meta-formalism-copilot
**Branch:** feat/llm-server-hygiene
**Commit:** f2f149bbe3518128e19d8e38613936f967e55a5b
**Scope:** `git diff origin/main...HEAD`
**Files in scope:**
- `app/api/edit/artifact/route.ts`
- `app/lib/llm/callLlm.ts`
- `app/lib/llm/callLlm.test.ts` (new)
- `app/lib/llm/streamLlm.ts`

**Code-fact-check report:** `docs/reviews/llm-server-hygiene/code-fact-check-report.md` (commit `f2f149b`).
This review uses that report as its foundation and does not re-verify behavioral
claims about the implementation; it focuses on consumer-facing consistency.

---

## Baseline Conventions

Surveyed sibling code under `app/api/**/route.ts` and `app/lib/llm/**` to establish
the patterns that callers and the rest of the codebase rely on:

1. **Error response envelope (HTTP).** Every LLM-backed route handler that catches
   an `OpenRouterError` returns `{ error: string, details: string }` with status
   `502`:
   - `app/api/edit/whole/route.ts:35-39`
   - `app/api/edit/inline/route.ts:27-31`
   - `app/api/refine/context/route.ts:52-56`
   - `app/api/formalization/lean/route.ts:143-147`
   - `app/api/explanation/lean-error/route.ts:36-40`
   - `app/lib/formalization/artifactRoute.ts:114-118` (the shared handler used by
     all formalization artifact routes)
   For non-OpenRouter errors the convention is `{ error: ``LLM call failed: ${message}`` }`
   at status `502`. For invalid-JSON LLM responses, the shared handler at
   `artifactRoute.ts:108-111` returns `{ error: "LLM response was not valid JSON",
   details: <500-char preview> }`.

2. **SSE event protocol.** `streamLlm` is the single emitter; its event shapes are:
   - `event: token` — `{ text: string }`
   - `event: done`  — `{ text: string, usage: LlmCallUsage }`
   - `event: error` — historically `{ error, details }`, now `{ error }` only
     (this branch).
   The single SSE consumer is `app/lib/formalization/api.ts:fetchStreamingApi`
   (lines 89-94), which only reads `parsed.error` from the error event — it does
   not access `details`.

3. **OpenRouter error class.** `OpenRouterError extends Error` with public
   `status: number` and `details: string`. Six route handlers (listed above) read
   `err.details` directly. There is no analogous typed error for streaming;
   `streamLlm` instead uses an ad-hoc `errorWithDetails(message, details)` helper
   that augments a plain `Error` with a `details` property.

4. **Anthropic client construction.** Prior to this branch the codebase used a
   single lazy module-scoped client (`getAnthropicClient`). The factory is the
   only entry point; both `callLlm` and `streamLlm.streamAnthropic` go through it.

5. **Logging convention.** `console.error` calls in the LLM path are prefixed
   with the endpoint, e.g. `[${endpoint}] OpenRouter error:` or
   `[${endpoint}] Unexpected error:`. Bodies / response previews have historically
   been included in log lines (e.g. `artifactRoute.ts:107`).

6. **Module export style for `app/lib/llm/callLlm.ts`.** Public surface includes
   `OPENROUTER_API_URL`, `DEFAULT_ANTHROPIC_MODEL`, the `OpenRouterError` class,
   types `LlmCallUsage`, `ResponseFormat`, `CacheKey`, the `callLlm` function,
   and previously `getAnthropicClient`.

---

## Findings

### Inconsistent invalid-JSON logging between `edit/artifact` and `artifactRoute`

**Severity:** Inconsistent
**Location:** `app/api/edit/artifact/route.ts:77-86` vs. `app/lib/formalization/artifactRoute.ts:106-111`
**Move:** #4 Verify error consistency
**Confidence:** High

The branch tightens the invalid-JSON log in `edit/artifact` to record only the
length:

```
console.error(`[edit/artifact] LLM returned invalid JSON: ${responseText.length} chars`);
```

…while `artifactRoute.ts:107` — the shared handler for every formalization
artifact (causal-graph, statistical-model, semiformal, property-tests,
counterexamples, dialectical-map, decomposition/extract) — still does:

```
console.error(`[${config.endpoint}] Failed to parse LLM response as JSON:`, preview);
```

…where `preview = responseText.slice(0, 500)`. The same hygiene rationale stated
in the new comment ("`responseText` is a function of the user's source material
and shouldn't end up in server logs") applies verbatim to `artifactRoute.ts` —
in fact more so, because formalization routes ingest the user's primary source
material, while `edit/artifact` only ingests already-emitted artifact JSON. The
log message wording also differs ("LLM returned invalid JSON" vs. "Failed to
parse LLM response as JSON"), which is a minor wording inconsistency on top of
the substantive one.

Note that the response-payload half of the convention (`details:
responseText.slice(0, 500)` returned to the caller) is consistent across both
sites — only the log call drifts.

**Recommendation:** Either apply the same length-only log treatment in
`artifactRoute.ts:107` (and align the wording), or revert `edit/artifact` to
match the established preview-logging behaviour. Picking one and applying it
across all artifact-generation paths avoids a per-endpoint trust-the-logs
matrix.

---

### `streamLlm` SSE error event silently dropped a documented field

**Severity:** Breaking (in principle) / Informational (in practice)
**Location:** `app/lib/llm/streamLlm.ts:68-71` (JSDoc) and `:162` (emit site)
**Move:** #3 Trace the consumer contract
**Confidence:** High

The SSE protocol JSDoc still documents:
```
event: error   — { error: "message", details: "..." }
```
…but the only emit site now sends `{ error: message }`. This is a backward-
incompatible change to the SSE error event shape: any external (or
out-of-process) SSE client that read `details` will now receive `undefined`.

**In-tree consumer impact: none.** The repo-wide SSE consumer
(`fetchStreamingApi`, `app/lib/formalization/api.ts:89-94`) reads only
`parsed.error`, never `details`. So this is technically a contract break that
costs nothing for current consumers — but the protocol JSDoc is the contract
for future consumers and must match.

The fact-check report flagged this exact JSDoc/emit-site drift (Claim 8,
Stale).

**Recommendation:** Update the SSE protocol JSDoc on
`app/lib/llm/streamLlm.ts:68-71` to document the new `event: error — { error: string }`
shape. If you want to preserve the option of restoring `details` later for
trusted in-process consumers, document it as an optional field that may or may
not be present and have callers treat it that way; otherwise drop it from the
docstring entirely.

---

### `errorWithDetails` is now a private helper that no consumer can usefully read

**Severity:** Minor
**Location:** `app/lib/llm/streamLlm.ts:30-34, 265`
**Move:** #4 Verify error consistency
**Confidence:** High

`errorWithDetails` builds an `Error` with a `details` property at line 265 (the
OpenRouter streaming-failure branch), but the catch block at line 162 now
forwards only `err.message` over SSE and to the log. The new JSDoc claims
"the property remains attached to the thrown Error for any in-process consumer
that opts in to reading it" — that is true mechanically, but there is no such
consumer in-tree. `errorWithDetails` is a non-exported function with one call
site, and its `details` payload is dead in practice.

This is not a correctness bug, but it leaves a vestigial channel that quietly
suggests "you could surface this to clients" while every other stream error
path (the non-OpenRouter branches all `throw new Error(...)` directly) does
not. In contrast, the synchronous side has a typed, well-used `OpenRouterError`
with a `details` field that six route handlers read.

**Recommendation:** Pick one of:
- Drop `errorWithDetails` entirely. Replace `throw errorWithDetails(...)` with
  `throw new OpenRouterError(response.status, errorBody)`. Then the streaming
  side and the synchronous side share the same error class, route handlers
  have a consistent way to surface 502s if they ever wrap a streaming call,
  and the dead-channel ambiguity goes away.
- Keep `errorWithDetails` and add a short comment naming the in-process
  consumer it exists for; otherwise it reads as forgotten code on next pass.

The first option is more aligned with the codebase's existing typed-error
convention.

---

### Renaming `getAnthropicClient` → `makeAnthropicClient` is a public API change

**Severity:** Inconsistent (no in-tree consumers, but public surface drift)
**Location:** `app/lib/llm/callLlm.ts:14`
**Move:** #2 Check naming against the grain · #3 Trace the consumer contract
**Confidence:** High

`getAnthropicClient` was an `export`ed function. The branch removes it and
exports `makeAnthropicClient` instead. The naming change is well-motivated and
correct — `make*` reads as "construct each time", `get*` reads as "fetch the
shared one", and the diff aligns the verb with the new behavior. This is good.

Two observations:
1. **No in-tree consumers break.** Repo-wide grep finds no remaining references
   to `getAnthropicClient`. The only callers were `callLlm.ts` itself and
   `streamLlm.ts`, both updated in the same commit.
2. **External-consumer impact.** Any out-of-tree code (workspace tools, scripts,
   downstream forks, or hypothetical future packages importing from
   `app/lib/llm/callLlm`) that imported `getAnthropicClient` will break. The
   `app/lib/llm/` directory does not appear to be a published package and is
   internal to this Next.js app, so the practical risk is near zero — but worth
   noting in the PR description as a public-surface change for anyone tracking
   internal API drift.

**Recommendation:** Add a one-line note to the PR description that
`getAnthropicClient` is removed in favor of `makeAnthropicClient` so anyone
maintaining branches against this code knows. No code change needed.

---

### Per-call client construction is consistent across `callLlm` and `streamLlm`

**Severity:** Informational (positive observation)
**Location:** `app/lib/llm/callLlm.ts:133`, `app/lib/llm/streamLlm.ts:207`
**Move:** #2 Check naming against the grain
**Confidence:** High

Both LLM entry points call `makeAnthropicClient(apiKey)` after reading
`process.env.ANTHROPIC_API_KEY` at request time. This is the right symmetry: the
synchronous and streaming paths now have identical lifecycle semantics for the
SDK client and identical env-var-rotation behavior. The new test
(`callLlm.test.ts`) pins the per-call construction invariant for `callLlm`; the
same property holds structurally for `streamLlm.streamAnthropic` even though
it has no analogous test.

**Recommendation (optional):** Add a parallel test in
`app/lib/llm/streamLlm.test.ts` (or extend the existing one if such a file
exists) covering the same per-call-construction invariant for the streaming
path. The two paths share an invariant; it should have one regression bumper
on each side or one shared helper.

---

### `OpenRouterError` shape and consumer contract are unchanged

**Severity:** Informational (positive observation)
**Location:** `app/lib/llm/callLlm.ts:18-27`
**Move:** #3 Trace the consumer contract
**Confidence:** High

The branch keeps `OpenRouterError`'s `name`, `status`, `details`, and message
format identical to `main`. All six route handlers that use `instanceof
OpenRouterError` and `err.details` continue to work. The only behavioral change
on this surface is internal: the constructor still receives `errorBody`, but
the line that previously logged that body has been removed. The HTTP-side
`{ error, details }` envelope reaching the caller is unchanged.

---

## What Looks Good

- **Symmetric client lifecycle.** Both `callLlm` and the streaming path now
  construct fresh clients per call. The SDK reads the env var at construction,
  so env rotation takes effect on the next request — a real improvement.
- **Unit-test coverage of the invariant.** `callLlm.test.ts` mocks the
  Anthropic SDK at the module boundary and asserts both that a client is
  constructed and that it picks up the current env-var key on each call. The
  test would correctly fail if a singleton sneaks back in.
- **HTTP error envelopes preserved.** `OpenRouterError`'s public shape, the
  `{ error, details }` 502 envelope, and the route-handler catch-block
  pattern are all untouched. No HTTP consumer breaks.
- **`edit/artifact` log/response asymmetry is intentional and well-commented.**
  The new comment correctly distinguishes "what's safe in server logs" from
  "what's safe to return to the caller who originated the request" — that's
  the right axis to think about, and the route now reflects it. The asymmetry
  matches Move #7 (Look for the asymmetry) in a *good* way: write/read are
  asymmetric here for a principled reason.

---

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 1 | Invalid-JSON logging tightened in `edit/artifact` but not in `artifactRoute` | Inconsistent | `app/lib/formalization/artifactRoute.ts:107` | High |
| 2 | SSE error event JSDoc still documents removed `details` field | Breaking (in principle) / Informational (in practice) | `app/lib/llm/streamLlm.ts:68-71` | High |
| 3 | `errorWithDetails` produces a `details` payload no consumer reads | Minor | `app/lib/llm/streamLlm.ts:30-34, 265` | High |
| 4 | `getAnthropicClient` removal is a public-surface rename | Inconsistent | `app/lib/llm/callLlm.ts:14` | High |
| 5 | `callLlm` and `streamLlm` now share per-call-construction invariant | Informational | `app/lib/llm/callLlm.ts:133`, `app/lib/llm/streamLlm.ts:207` | High |
| 6 | `OpenRouterError` shape and 502 envelope unchanged | Informational | `app/lib/llm/callLlm.ts:18-27` | High |

---

## Overall Assessment

This branch is **largely consistent** with the codebase's API patterns, with
two real consistency gaps and one cosmetic JSDoc drift. The core public
contracts (HTTP `{ error, details }` 502 envelope, `OpenRouterError` class
shape, SSE `token`/`done` event payloads) are all preserved. The Anthropic
client lifecycle change is the most consumer-visible internal change and is
applied symmetrically across the synchronous and streaming paths — that's good
internal-API discipline.

The two issues worth fixing in this PR:

1. **Apply the invalid-JSON logging tightening uniformly.** `edit/artifact`
   now logs length only; `artifactRoute.ts` (used by ~7 routes) still logs the
   500-char preview. The hygiene argument that motivated the `edit/artifact`
   change applies more strongly to `artifactRoute.ts` because those routes
   ingest source material directly. Pick one rule and apply it everywhere.

2. **Update the SSE error event JSDoc.** The protocol docstring is now stale
   relative to the emit site. No in-tree consumer is affected, but the JSDoc
   *is* the SSE protocol's contract — leaving it stale is a small
   contract-drift issue that future readers will trip on.

The `errorWithDetails` cleanup and the `getAnthropicClient`-rename PR-description
note are nice-to-haves, not blockers. Issues are all fixable in place; none
suggest the author needs to re-survey the codebase.
