# Performance Review

**Repository:** meta-formalism-copilot
**Branch:** feat/llm-server-hygiene
**Commit:** f2f149bbe3518128e19d8e38613936f967e55a5b
**Scope:** `git diff origin/main...HEAD` — `app/api/edit/artifact/route.ts`, `app/lib/llm/callLlm.ts`, `app/lib/llm/callLlm.test.ts`, `app/lib/llm/streamLlm.ts`
**Reviewed:** 2026-04-27
**Fact-check input:** `docs/reviews/llm-server-hygiene/code-fact-check-report.md` (used as foundation; behavioral claims about per-call construction, log-redaction, and SSE shape are taken as verified)

---

## Data Flow and Hot Paths

The diff replaces a module-scope, lazy-initialized `getAnthropicClient(apiKey)` singleton with a per-call `makeAnthropicClient(apiKey)` factory, and tightens server-side log content (status only, no provider error bodies; length only, no JSON content) for `/api/edit/artifact` and `streamLlm`.

`makeAnthropicClient` is invoked from exactly two call sites that matter for performance:

- `app/lib/llm/callLlm.ts:133` — non-streaming Anthropic branch. Reached from request handlers `app/api/edit/artifact/route.ts`, `app/api/edit/whole/route.ts`, `app/api/edit/inline/route.ts`, `app/api/explanation/lean-error/route.ts`, `app/api/refine/context/route.ts`, the non-streaming branch of `app/api/formalization/lean/route.ts`, and `app/lib/formalization/artifactRoute.ts:82`.
- `app/lib/llm/streamLlm.ts:207` (`streamAnthropic`) — streaming Anthropic branch. Reached from `app/api/decomposition/extract/route.ts`, `app/api/formalization/lean/route.ts`, and `app/lib/formalization/artifactRoute.ts:71`.

Each handler issues **at most one** `callLlm`/`streamLlm` per request — there are no `Promise.all`/loop fan-outs (`grep` for `Promise.all` in `app/api` finds nothing). Frequency is therefore one Anthropic-client construction per LLM request, which is bounded by external API latency (typically 1–60 s for the model call itself; streaming runs even longer). Realistic call frequency is low — interactive user actions, not automated traffic.

**Hot-path classification.** The construction site is on the request path, but it is bracketed by an LLM round-trip whose cost dominates by 4–6 orders of magnitude. The "hot path" label applies in the structural sense (per-request) but not in the cost-sensitive sense (per-request *and* dominant cost).

---

## Findings

#### Per-call Anthropic client construction is essentially free; no connection-pool regression

**Severity:** Informational
**Location:** `app/lib/llm/callLlm.ts:14-16`, `app/lib/llm/streamLlm.ts:207`
**Move:** Trace the memory lifecycle / Find the work that moved to the wrong place
**Confidence:** High

The `Anthropic` constructor in `@anthropic-ai/sdk@^0.x` is option-merging plus field assignment — no I/O, no socket setup, no `http.Agent`/`https.Agent` allocation. I read the constructor in `node_modules/@anthropic-ai/sdk/src/client.ts:382-420`: it stores `apiKey`, `authToken`, `baseURL`, `timeout`, `maxRetries`, `logLevel`, `fetchOptions`, and `fetch`. The `fetch` member is just a reference to `globalThis.fetch` returned by `Shims.getDefaultFetch` (`node_modules/@anthropic-ai/sdk/src/internal/shims.ts:13-21`):

```ts
export function getDefaultFetch(): Fetch {
  if (typeof fetch !== 'undefined') {
    return fetch as any;
  }
  ...
}
```

Connection pooling lives in undici's *global* dispatcher (Node's built-in `fetch`), which is shared process-wide regardless of how many Anthropic client instances exist. Constructing a fresh client per call therefore does **not** lose keep-alive or pool reuse — TCP connections to `api.anthropic.com` continue to be reused across requests.

Allocation cost is one small object plus a few field reads from `process.env` (the SDK reads `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_LOG`). On modern V8 this is well under a microsecond, against an LLM call of ~1–60 seconds. The performance delta vs. the old singleton is unmeasurable.

**Hot-path temperature:** Structurally hot (per-request) but cost-trivial (~10⁻⁶ of the surrounding work). Not a finding to act on.

**Recommendation:** None. The per-call construction is a defensible correctness/operability change (env-var rotation without redeploy, no key-staleness risk after the singleton was first instantiated) that costs essentially nothing. The accompanying test (`callLlm.test.ts`) pins this property — that's the right way to keep it from regressing.

---

#### `simulateStreamFromCache` is intentionally serialized; flag for awareness only

**Severity:** Informational
**Location:** `app/lib/llm/streamLlm.ts:176-191`
**Move:** Find the work that moved to the wrong place
**Confidence:** High

Not introduced by this branch, but reachable through the modified `streamLlm` path: when `SIMULATE_STREAM_FROM_CACHE === "true"`, a cache hit walks the cached text in 20-char chunks separated by 15 ms `setTimeout` waits. For a 120k-token (~480 KB) cached payload that's `480000 / 20 * 15 ms ≈ 360 s` to drain a single cache hit, holding the SSE controller and the Anthropic-side keep-alive idle for the duration. This is gated behind an env var presumably only set in dev/test, so production impact is zero. Mentioning it because the diff touches the surrounding code and a future maintainer may not realize the simulator's cost is `O(length)` in wall-clock.

**Recommendation:** None unless `SIMULATE_STREAM_FROM_CACHE` ever ships to a production environment. If it does, scale `CHUNK_SIZE` to keep total simulated time bounded (e.g., target ≤ 5 s regardless of payload).

---

#### Log-redaction has no measurable performance effect; positive note

**Severity:** Informational
**Location:** `app/api/edit/artifact/route.ts:77-81`, `app/lib/llm/callLlm.ts:182-186`, `app/lib/llm/streamLlm.ts:158-162`
**Move:** Identify the serialization tax (positive)
**Confidence:** High

Replacing `console.error("...", responseText.slice(0, 300))` with `console.error("... ${responseText.length} chars")` removes a 300-char `slice` allocation and string-format step from the error path. This is on a *failure* path, which is by definition rare; the savings are not measurable at any realistic rate. Note for completeness because the change is in the diff.

**Recommendation:** None.

---

## What Looks Good

- **No fan-out, no nested loops around the LLM call.** Each request handler calls `callLlm`/`streamLlm` exactly once; no N+1 risk introduced or exacerbated.
- **Cache check happens before client construction.** `callLlm` and `streamLlm` consult `getCachedResult` before reaching `makeAnthropicClient`, so cache hits skip the (already trivial) construction entirely. This is the right ordering.
- **Hash computed once, reused for `getCachedResult`+`setCachedResult`.** `app/lib/llm/callLlm.ts:120` — avoids redundant hashing of `(model, systemPrompt, userContent, maxTokens)` on the write back.
- **Analytics + cache writes wrapped in `try/catch`.** `recordAndCache` (callLlm.ts:76-96 and streamLlm.ts:46-63) cannot bubble up to fail the request when `appendAnalyticsEntry` or `setCachedResult` errors. This protects the LLM round-trip's cost from being thrown away on storage hiccups.
- **`ReadableStream` is created with a per-request `start` callback that closes the controller in finally-style branches** (cache-hit path closes; error path closes; provider paths close at the end of `streamAnthropic`/`streamOpenRouter`). No obvious controller leak.
- **`encoder` (TextEncoder) is module-scoped** in `streamLlm.ts:18` rather than per-call, which is the right tradeoff (cheap to construct but free if shared).

---

## What I Did Not Find

I looked specifically for the items the requester asked about. None present in the diff:

- **No batched/streaming endpoint changes.** The SDK's `messages.batches.*` API is not used anywhere in `app/`. `messages.stream` usage (streamLlm.ts:210) was already in the codebase and is unchanged structurally.
- **No redundant rebuild on hot paths.** `makeAnthropicClient` is called once per request, not in any loop. The Anthropic SDK does not memoize anything across instances that would be wasted on construction.
- **No connection-pool implications.** As detailed in finding #1, the SDK delegates to `globalThis.fetch`; the pool is process-global.

---

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 1 | Per-call Anthropic client construction is free; pool is preserved via global undici dispatcher | Informational | `callLlm.ts:14`, `streamLlm.ts:207` | High |
| 2 | `simulateStreamFromCache` is `O(length)` wall-clock — dev-only, but flag for future | Informational | `streamLlm.ts:176-191` | High |
| 3 | Log-redaction removes a 300-char slice on a failure path; trivially positive | Informational | `route.ts:81`, `callLlm.ts:186`, `streamLlm.ts:160` | High |

---

## Overall Assessment

This branch is performance-neutral. The headline change — moving from a module-scope Anthropic client to per-call construction — does not regress connection reuse, because the Anthropic SDK does not own the connection pool: it delegates to `globalThis.fetch`, which in Node 18+ uses undici's process-global dispatcher. Construction itself is a few field assignments and `process.env` reads, so the per-request overhead is well under a microsecond against an LLM round-trip measured in seconds.

There are no batched-endpoint or fan-out patterns in the diff to worry about; each request handler issues one LLM call. No nested loops, no N+1 shapes, no unbounded collections, no contention surfaces are introduced. The log-redaction changes remove a small allocation on the (rare) error path — a tiny positive, not load-bearing.

No profiling or benchmarking is needed to confirm these conclusions; the analysis follows from reading the SDK constructor and the call-site frequency. The only thing worth keeping an eye on is `simulateStreamFromCache`'s linear-in-length behavior if `SIMULATE_STREAM_FROM_CACHE` ever escapes dev — that's pre-existing, not a branch finding.
