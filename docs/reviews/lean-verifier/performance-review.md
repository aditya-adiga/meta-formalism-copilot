# Performance Review — `feat/lean-verifier-graceful-degradation`

**Commit:** c95c9cb50d1a3634e655700f1b6c768a6774fe9b
**Branch:** `feat/lean-verifier-graceful-degradation`
**Scope:** `git diff origin/main...HEAD` — 10 files, +122/-20
**Fact-check input:** `docs/reviews/lean-verifier/code-fact-check-report.md` (14 claims; 11 verified, 2 stale, 1 unverifiable)

---

## Data Flow and Hot Paths

The branch teaches the Lean verification path how to distinguish "verifier offline" from "proof failed":

1. **API route** `app/api/verification/lean/route.ts` — proxies a single user request to an external Lean verifier. No batching. One inbound HTTP request → one outbound `fetch`. The 35s `AbortController` timeout is unchanged. Removed: `?? "http://localhost:3100"` default URL and the `{ valid: true, mock: true }` catch-all fallback. Added: three `unavailable` paths (not-configured, error, unreachable).
2. **`verifyLean` (`api.ts`)** — client-side wrapper, one fetch per call.
3. **`leanRetryLoop` (`leanRetryLoop.ts`)** — generate Lean → verify → up to 3 attempts. Now short-circuits on `unavailable=true`, returning immediately without consuming the remaining retry budget.
4. **`useFormalizationPipeline`** — orchestrates a single user-driven Lean generation/re-verify. Reads `verifyResultToStatus` once per verification.
5. **`LeanCodeDisplay`** — adds a conditional banner and extends an existing button gate to include `"unavailable"`. No new effects, state, or hooks.
6. **`formalizeNode`** (transitively, via `leanRetryLoop`) — invoked by `useAutoFormalizeQueue` in a serial `for` loop over decomposed propositions, so total verification fan-out is `O(nodes × ≤3 attempts)`. Realistically `nodes` ≤ ~100 in a decomposed workspace. Hot in the sense that LLM calls dominate cost — anything that prevents wasted LLM calls is materially valuable; anything that adds unnecessary LLM calls is materially costly.

**Path temperature:** mixed — the API route is per-request (warm), the retry loop short-circuit is in a path that's executed once per node in a possibly-large batch (warm, financially significant), the hook/component changes are user-driven and rare (cold).

**Expected data sizes:** request body is one Lean program (typically a few KB, capped by upstream LLM token limits — ~32KB worst case). Response body from the verifier is small JSON (errors as text, typically <10KB). No collection growth in this branch.

---

## Findings

This is a small, focused branch and there are no critical or high-severity performance issues. The most consequential performance-relevant change — the retry-loop short-circuit on `unavailable` — is a clear positive (see What Looks Good).

### #### Pre-existing: AbortController timeout not cleared on fetch-throw path

**Severity:** Low
**Location:** `app/api/verification/lean/route.ts:32-56`
**Move:** Trace the memory lifecycle (resource lifecycle)
**Confidence:** High

The `setTimeout(...)` handle (`timeout`) is cleared on the success and `!res.ok` paths (`clearTimeout(timeout)` at line 43 runs before the `if (!res.ok)` check). On the catch path (network error, DNS failure, `controller.abort()` firing), `clearTimeout` is never called. In practice the leak is bounded: either (a) the abort already fired, in which case the timer is gone, or (b) `fetch` rejected for some other reason and the timer will fire harmlessly (calling `abort()` on an already-failed request) within ≤35s and then be GC'd. So it's not a real resource leak — just an asymmetry. **This is pre-existing on `main`** (the `try` block had the same shape before the branch) — flagging only because the diff touches this region.

**Recommendation:** Optional. If you want symmetry, move `clearTimeout(timeout)` into a `finally` block. Not worth a follow-up PR on its own.

---

### #### Re-verify on "unavailable" status will likely fail again

**Severity:** Informational
**Location:** `app/components/features/lean-display/LeanCodeDisplay.tsx:111-119`, `app/hooks/useFormalizationPipeline.ts:150-170`
**Move:** Count the hidden multiplications (per-user-action cost)
**Confidence:** Medium

The branch adds `verificationStatus === "unavailable"` to the gate that surfaces the "Re-verify" button. A user who clicks Re-verify when the verifier is misconfigured (the `verifier-not-configured` reason) will issue another `/api/verification/lean` POST that is guaranteed to return `unavailable: true` again, since `process.env.LEAN_VERIFIER_URL` is read fresh per request but only changes when the server is redeployed. Cost per click is one round-trip (cheap on its own), but if a frustrated user clicks it repeatedly each click is wasted work.

This is mostly a UX nit, not a real performance problem — the fetch is cheap and there's no client-side caching to invalidate. But if you wanted to be tidy, the route could surface `reason` to the client and the UI could disable Re-verify when `reason === "verifier-not-configured"` (since that won't change without a redeploy), while keeping it enabled for `verifier-unreachable`/`verifier-error` (transient — retry can succeed). The route already returns `reason` in the JSON; `verifyLean` discards it.

**Recommendation:** Low priority. If you act on this, plumb `reason` through `VerifyLeanResult` and gate the Re-verify button on transient reasons only. Otherwise leave as-is and accept the click-spam cost.

---

### #### `verifier-error` swallows the upstream response body

**Severity:** Informational
**Location:** `app/api/verification/lean/route.ts:45-49`
**Move:** Identify the serialization tax (data discarded that may be useful)
**Confidence:** High

When the upstream verifier returns a non-2xx, the route now returns `unavailableResponse("verifier-error", "HTTP ${res.status}")` without ever calling `await res.json()` on the response. This is a behavioral change documented and verified in the fact-check (Claim 2). From a *performance* angle this is a small win: skip parsing a JSON body the route is choosing to ignore. The cost is diagnostic — operators won't see whether the verifier returned a structured error.

Not a finding against the branch — flagging as informational because it interacts with the operability/observability surface. If the upstream verifier ever returns a 5xx with a useful error envelope, that signal is dropped on the floor.

**Recommendation:** None for performance. If logging is desired for ops, log the body (or just the status) on the server side; do not surface it to the client.

---

## What Looks Good

- **Retry-loop short-circuit on `unavailable`** (`leanRetryLoop.ts:73-77`). This is the financially significant change in the branch. Before: a 3-attempt retry would issue up to 3 `generateLean*` calls (each a streaming Anthropic completion) even when each verification was guaranteed to come back `unavailable`. After: the loop returns after the first verification confirms unavailability, saving up to **2 redundant LLM calls per node**, which at decomposition-batch scale (`useAutoFormalizeQueue` running over ~tens of nodes) is a real cost saving — realistically tens of dollars and minutes of latency on a misconfigured deploy. Good move.
- **Constant-time helper** (`verifyResultToStatus` in `api.ts:115-118`). Pure, allocation-free, called once per verify. Correct precedence (`unavailable` over `valid`). No performance concerns.
- **No new state, effects, or memoization** in `LeanCodeDisplay.tsx`. The added banner is render-only; the gate change is one extra disjunct in an existing condition. No new re-render multiplication, no new closure capture, no new dependency-array hazard. The pre-existing render-time `setSyncedCode` pattern (line 43-52) is unchanged.
- **No changes to fetch/timeout structure** in the API route — the 35s `AbortController` timeout is preserved unchanged. No new inflight request tracking, no new connection pooling concerns.
- **Persistence sanitization** (`workspacePersistence.test.ts`) maps `"unavailable"` → `"none"` on rehydrate, so the localStorage path stays bounded to known statuses and there's no risk of `"unavailable"` accumulating in persisted blobs over time.

---

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 1 | AbortController timeout not cleared on fetch-throw path (pre-existing) | Low | `app/api/verification/lean/route.ts:32-56` | High |
| 2 | Re-verify on `verifier-not-configured` issues a guaranteed-unavailable round-trip | Informational | `LeanCodeDisplay.tsx:111-119`, `useFormalizationPipeline.ts:150-170` | Medium |
| 3 | `verifier-error` discards upstream response body (operability, not perf) | Informational | `app/api/verification/lean/route.ts:45-49` | High |

---

## Overall Assessment

This is a small, well-scoped branch with a clear net-positive performance impact: the `leanRetryLoop` short-circuit on `unavailable` prevents a class of wasted LLM calls that would have been most expensive precisely when the verifier was offline (i.e., when the user gets the *least* value from the retries). The API route, hook, and component changes are essentially free in performance terms — a couple of extra branches and a banner element, no new allocations, no new effects, no algorithmic regressions.

There are no critical or high-severity findings. The three items above are all in the Low/Informational tier and none of them block the PR. The most actionable one is plumbing `reason` through `VerifyLeanResult` so the UI can distinguish "won't work without a redeploy" from "transient", but that's a polish improvement, not a performance fix.

No profiling or benchmarking is needed to confirm any of these findings — they're all evident from static analysis. The cost-saving benefit of the retry short-circuit is provable from code structure (3 LLM calls → 1 LLM call per unavailable node) without measurement.
