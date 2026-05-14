# Code Fact-Check Report

**Repository:** meta-formalism-copilot
**Branch:** feat/llm-server-hygiene
**Commit:** f2f149bbe3518128e19d8e38613936f967e55a5b
**Scope:** `git diff origin/main...HEAD` and `git log origin/main..HEAD`
**Files in scope:** `app/api/edit/artifact/route.ts`, `app/lib/llm/callLlm.ts`, `app/lib/llm/callLlm.test.ts`, `app/lib/llm/streamLlm.ts`
**Checked:** 2026-04-27
**Total claims checked:** 14
**Summary:** 11 verified, 1 mostly accurate, 1 stale, 1 incorrect, 0 unverifiable

---

## Claim 1: "Construct a fresh Anthropic client per call. The SDK is cheap to instantiate and per-call construction means an env-var rotation (e.g. swapping ANTHROPIC_API_KEY in the Vercel dashboard) takes effect on the next request without needing a redeploy or process restart."

**Location:** `app/lib/llm/callLlm.ts:10-13`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

`makeAnthropicClient` (line 14-16) calls `new Anthropic({ apiKey })` on every invocation; there is no module-scope cache. `callLlm` (line 133) and `streamAnthropic` (`streamLlm.ts:207`) both call `makeAnthropicClient(anthropicKey)` after reading `process.env.ANTHROPIC_API_KEY` at request time, so a rotated env var would be picked up on the next request. The "SDK is cheap to instantiate" portion is a performance assertion not measured, but the behavioral claim about env-var rotation is supported by the code.

**Evidence:** `app/lib/llm/callLlm.ts:14-16`, `app/lib/llm/callLlm.ts:111`, `app/lib/llm/callLlm.ts:133`, `app/lib/llm/streamLlm.ts:84`, `app/lib/llm/streamLlm.ts:207`

---

## Claim 2: "Centralized LLM call with Anthropic -> OpenRouter -> mock fallback. Returns the raw text response and usage/cost metadata. On mock fallback, returns text: \"\" — the caller provides its own mock text."

**Location:** `app/lib/llm/callLlm.ts:98-100`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

The provider chain matches: lines 130-159 handle the Anthropic branch, lines 161-203 handle the OpenRouter branch, and lines 206-223 are the mock fallback. The mock fallback returns `{ text: "", usage }` (line 223), confirming the empty-string contract.

**Evidence:** `app/lib/llm/callLlm.ts:130-223`

---

## Claim 3: "Log only status + endpoint here; the body can echo parts of the request and we don't want it on disk in plaintext. The body still rides on OpenRouterError so route handlers can decide what (if anything) to surface to the caller."

**Location:** `app/lib/llm/callLlm.ts:182-185`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

The `console.error` on line 186 includes only `status=${response.status}` — the body is no longer logged. The body is still attached to the thrown `OpenRouterError` via `errorBody` on line 187, and `OpenRouterError` (lines 18-27) stores it as `details`. `app/api/edit/artifact/route.ts:91` reads `err.details` and surfaces it in the 502 response, demonstrating that route handlers retain access.

**Evidence:** `app/lib/llm/callLlm.ts:181-188`, `app/lib/llm/callLlm.ts:18-27`, `app/api/edit/artifact/route.ts:88-94`

---

## Claim 4: "Record analytics and write to cache. Failures are silently ignored so they never break the LLM call that produced the result."

**Location:** `app/lib/llm/callLlm.ts:74-75`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

Both the analytics append (lines 83-90) and the cache write (line 93) are wrapped in `try { ... } catch { /* ... */ }` blocks that swallow exceptions.

**Evidence:** `app/lib/llm/callLlm.ts:76-96`

---

## Claim 5: "OpenRouter-compatible response_format for structured outputs. See https://openrouter.ai/docs/guides/features/structured-outputs"

**Location:** `app/lib/llm/callLlm.ts:38-39`
**Type:** Reference
**Verdict:** Unverifiable
**Confidence:** Medium

The URL is plausible and not changed by this branch, but I did not fetch it. The shape of the type — `{ type: "json_schema", json_schema: { name, strict, schema } }` — matches the OpenAI-compatible structured-outputs convention that OpenRouter typically passes through. Marking unverifiable because static analysis cannot confirm a live URL or that OpenRouter still documents this exact shape.

**Evidence:** `app/lib/llm/callLlm.ts:38-47`

---

## Claim 6: "When provided, enforces structured JSON output via OpenRouter's response_format. Only used with the OpenRouter provider (Anthropic direct API does not support this)."

**Location:** `app/lib/llm/callLlm.ts:56-57`
**Type:** Behavioral
**Verdict:** Mostly accurate
**Confidence:** High

The OpenRouter branch passes `response_format: responseFormat` when set (line 175). However, the Anthropic branch on lines 139-146 also conditionally adds `output_config: { format: { type: "json_schema", schema: responseFormat.json_schema.schema } }` when `responseFormat` is present, contradicting "Only used with the OpenRouter provider." So the field is in fact also passed to the Anthropic SDK call (just under a different key). Whether the Anthropic API accepts/ignores `output_config` is a separate question, but the comment "Only used with the OpenRouter provider" is not literally true of the code path.

**Evidence:** `app/lib/llm/callLlm.ts:139-146`, `app/lib/llm/callLlm.ts:175`

---

## Claim 7: "Create an Error with a `details` property for structured error info. The streaming catch block intentionally does not log or forward `details` over SSE (provider error bodies can echo request content), but the property remains attached to the thrown Error for any in-process consumer that opts in to reading it."

**Location:** `app/lib/llm/streamLlm.ts:25-29`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

The streaming catch block (lines 156-165) does `console.error` of `message` only and emits `sseEvent("error", { error: message })` without any `details`. The `details` property is still set on the error by `errorWithDetails` (line 32), so an in-process consumer (e.g., a unit test or wrapper) could still cast and read it.

**Evidence:** `app/lib/llm/streamLlm.ts:30-34`, `app/lib/llm/streamLlm.ts:156-165`

---

## Claim 8: "SSE protocol: event: token — { text: \"partial chunk\" } / event: done — { text: \"full accumulated text\", usage: LlmCallUsage } / event: error — { error: \"message\", details: \"...\" }"

**Location:** `app/lib/llm/streamLlm.ts:68-71`
**Type:** Behavioral
**Verdict:** Stale
**Confidence:** High

The first two event shapes match the implementation (token event at lines 186, 221, 299; done event at lines 108, 153, 190, 237, 321). The `error` event's documented shape `{ error, details }` is no longer accurate: the only emit site now sends `{ error: message }` (line 162). The `details` field was removed in this same commit (7c799cc), but this JSDoc was not updated to match. No client-side consumer reads `details` from SSE error events (verified by repo-wide grep).

**Evidence:** `app/lib/llm/streamLlm.ts:162` (only error emit site); diff shows the prior `{ error: message, details }` was reduced to `{ error: message }` while this JSDoc was untouched.

---

## Claim 9: "Provider chain mirrors callLlm(): Anthropic → OpenRouter → mock. Cache hits emit a single `done` event."

**Location:** `app/lib/llm/streamLlm.ts:73-74`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

The provider chain matches `callLlm`: Anthropic check at line 114, OpenRouter check at line 124, mock fallback at line 134. Cache hits emit a single `done` event on line 108 (or simulate streaming when `SIMULATE_STREAM_FROM_CACHE === "true"`, in which case the cache hit emits multiple `token` events plus a final `done` — slight nuance the comment doesn't mention, but lines 102-109 show the default path is exactly one `done`).

**Evidence:** `app/lib/llm/streamLlm.ts:84-90`, `app/lib/llm/streamLlm.ts:99-112`, `app/lib/llm/streamLlm.ts:114-155`

---

## Claim 10: "Provider error bodies can echo parts of the request, so don't write them to logs or send them to the client over SSE."

**Location:** `app/lib/llm/streamLlm.ts:158-159`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

`console.error` on line 160 logs only `${message}` (which is the `Error.message`, e.g., `"OpenRouter API error: 400"` from `errorWithDetails`) and not the body. The SSE error event on line 162 sends only `{ error: message }`.

**Evidence:** `app/lib/llm/streamLlm.ts:160`, `app/lib/llm/streamLlm.ts:162`, `app/lib/llm/streamLlm.ts:265` (errorWithDetails site)

---

## Claim 11: "Simulate token-by-token streaming from a cached result. Emits chunks of ~20 chars with a small delay between each, so the client sees the same partial-JSON rendering behavior as a real LLM stream."

**Location:** `app/lib/llm/streamLlm.ts:170-175`
**Type:** Behavioral / Configuration
**Verdict:** Verified
**Confidence:** High

`CHUNK_SIZE = 20` (line 181), `DELAY_MS = 15` (line 182). The loop on lines 184-188 slices the text into 20-char chunks, enqueues a `token` event per chunk, and `await`s `setTimeout` for the delay. A final `done` event closes (line 190).

**Evidence:** `app/lib/llm/streamLlm.ts:181-191`

---

## Claim 12: "Log only length, not content — `responseText` is a function of the user's source material and shouldn't end up in server logs. The response payload still echoes a slice back to the caller, since they originated the request and need it to debug their input."

**Location:** `app/api/edit/artifact/route.ts:77-80`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

Line 81 logs only `${responseText.length} chars`. Line 83 returns `details: responseText.slice(0, 500)` to the caller in the JSON response. Both halves of the claim hold.

**Evidence:** `app/api/edit/artifact/route.ts:81`, `app/api/edit/artifact/route.ts:83`

---

## Claim 13 (commit 7c799cc): "edit/artifact: invalid-JSON server log records length only, not the 300-char slice. The 500-char slice is still returned to the caller in the response — they originated the request and need it to debug."

**Location:** Commit message of `7c799cc`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

The diff shows the prior log was `console.error("[edit/artifact] LLM returned invalid JSON:", responseText.slice(0, 300));` and is now `console.error(\`[edit/artifact] LLM returned invalid JSON: ${responseText.length} chars\`);` — length only, no content. Line 83 still returns `details: responseText.slice(0, 500)` to the caller.

**Evidence:** `app/api/edit/artifact/route.ts:81`, `app/api/edit/artifact/route.ts:83`, diff vs origin/main

---

## Claim 14 (commit f2f149b): "No behavior change. Lint clean; 222/222 tests pass."

**Location:** Commit message of `f2f149b`
**Type:** Configuration / Reference
**Verdict:** Incorrect
**Confidence:** High

`npm test -- --run` reports `Test Files 25 passed (25), Tests 222 passed (222)` — the 222/222 figure is exact.

`npm run lint` does not pass cleanly: it reports `2 problems (0 errors, 2 warnings)` from `app/page.tsx:209` and `app/page.tsx:271` (react-hooks/exhaustive-deps). These warnings are pre-existing and not introduced by this branch (verified by inspecting the changed files; `app/page.tsx` is not in the diff). However, the literal claim "Lint clean" is false — lint produces non-zero output of warnings. A precise wording would be "lint passes with no errors (2 pre-existing warnings)" or "no new lint findings."

The "No behavior change" portion is itself nuanced: this commit is JSDoc-only on `errorWithDetails` (verified — diff is text only inside a JSDoc block), so no runtime behavior changed within this commit.

**Evidence:** `npm test -- --run` output (Tests 222 passed); `npm run lint` output (2 warnings); `git diff` of `f2f149b` (JSDoc only).

---

## Claims Requiring Attention

### Incorrect
- **Claim 14** (`f2f149b commit message`): "Lint clean" is not literally true — `npm run lint` emits 2 warnings (both pre-existing in `app/page.tsx`, none in changed files). Tighter wording: "no errors; 2 pre-existing warnings unchanged."

### Stale
- **Claim 8** (`app/lib/llm/streamLlm.ts:71`): The SSE protocol JSDoc still documents `event: error — { error: "message", details: "..." }`, but the implementation now emits only `{ error: message }`. Update the JSDoc to drop `details` from the documented error event shape.

### Mostly Accurate
- **Claim 6** (`app/lib/llm/callLlm.ts:56-57`): Comment says `responseFormat` is "Only used with the OpenRouter provider," but the Anthropic branch (lines 139-146) also forwards it as `output_config`. Either remove the conditional Anthropic block or reword the comment to acknowledge both providers.

### Unverifiable
- **Claim 5** (`app/lib/llm/callLlm.ts:39`): The OpenRouter docs URL was not fetched. Confirm out-of-band that the linked page still describes the `json_schema` shape used by `ResponseFormat`.
