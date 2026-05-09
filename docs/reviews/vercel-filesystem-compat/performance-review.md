# Performance Review: vercel-filesystem-compat

**Repository:** meta-formalism-copilot
**Branch:** feat/vercel-filesystem-compat
**Commit:** b64c1cade4a69a4a5154f6cd67aa30ce7cf8841b
**Scope:** `git diff origin/main...HEAD` (3 files changed, +21/-2)
**Reviewed:** 2026-04-27
**Fact-check input:** `docs/reviews/vercel-filesystem-compat/code-fact-check-report.md`

Files in scope:
- `app/lib/utils/dataDir.ts` (new)
- `app/lib/analytics/persist.ts`
- `app/lib/llm/cache.ts`

---

## Data Flow and Hot Paths

The diff introduces a single helper, `dataDir(...subpaths)`, that returns `/tmp` when `process.env.VERCEL` is set and `process.cwd()/data` otherwise. Two existing modules now route through it:

1. **`app/lib/llm/cache.ts`** — the LLM result cache. `getCachedResult` is called on every `callLlm()` and every `streamLlm()` invocation (`app/lib/llm/callLlm.ts:125`, `app/lib/llm/streamLlm.ts:101`), which sit behind every formalization API route (semiformal, lean, causal-graph, statistical-model, property-tests, balanced-perspectives, decomposition, edits, verification). This is the **hottest server-side path in the app** — every LLM-backed user action touches it. Cache files are sha256-named JSON blobs.

2. **`app/lib/analytics/persist.ts`** — `appendAnalyticsEntry` is called once per LLM call (success, failure, mock fallback) from both `callLlm` and `streamLlm`. `appendFileSync` is used. `readAnalyticsEntries` is called only by `GET /api/analytics`, an admin-style read endpoint, so it is cold-path.

The branch only changes **where** these files live; it does not change call frequency, payload sizes, or algorithmic structure. So the relevant performance question is not "did this change introduce a bottleneck" but "does the new location have different performance characteristics that matter for the existing code paths."

Hot path classification:
- `dataDir()` resolution — called once per import (module top-level), then frozen into `DATA_DIR`/`CACHE_DIR` constants. Cold path; one `process.env` read at module init. Not a finding.
- Cache read/write at `/tmp` — hot path on Vercel (every LLM call).
- Analytics append at `/tmp` — hot path on Vercel.

Realistic data sizes:
- Cache directory: existing dev `data/` is ~7.7 MB / 334 cache files. Production scale depends on prompt diversity but is bounded by Vercel's `/tmp` quota (~512 MB) — see Finding 4.
- Analytics file: one JSON line per LLM call. Each line ~300-500 bytes. At even modest usage (1k calls/day) this is bounded; on Vercel `/tmp` it resets per cold start, so unbounded growth is not a concern there.

---

## Findings

### 1. Cache hit rate collapses on Vercel due to per-instance `/tmp` and cold-start eviction

**Severity:** High
**Location:** `app/lib/llm/cache.ts:7`, `app/lib/utils/dataDir.ts:12-15`
**Move:** Question the cache (move 8) + Find work that moved to the wrong place (move 3)
**Confidence:** High
**Path temperature:** Hot — `getCachedResult` runs on every formalization API call. Every panel (semiformal, lean, causal-graph, statistical-model, property-tests, balanced-perspectives) and decomposition call goes through it.

The on-disk JSON cache was designed against a persistent local filesystem, where a hash that has been generated once is reusable across process restarts and across developers (when committed via `data/`). On Vercel, `/tmp` is (a) wiped on cold start and (b) per-Function-instance — concurrent requests routed to different instances see different caches, and a redeployment gives every instance a fresh empty `/tmp`. Concretely:

- A user repeating the same formalization 30 minutes later will likely cold-start and re-pay the full LLM cost.
- Two users hitting a load-balanced fan-out simultaneously each pay full cost the first time, even when the prompt is identical.
- The "simulate stream from cache" dev affordance (`streamLlm.ts:105-109`) and the cache-replay UX both become inert in production.

This is not a regression introduced by the diff per se — without `dataDir()`, writes would simply fail on Vercel. But the diff makes the cache **silently degraded** rather than loud-failed. The fact-check report corroborates this (Claim 2): the JSDoc captures cold-start eviction but omits the per-instance fan-out, which compounds the hit-rate problem.

Cost/latency impact, assuming Anthropic Sonnet at typical formalization sizes:
- Each cache miss that would otherwise have hit costs roughly $0.003-$0.40 per call (decomposition can be much more — see project memory note about 120k-token nodes hitting $0.40+).
- Latency penalty per missed hit: 2-15s for non-streaming, similar wall-clock for streaming (TTFT is the user-perceived hit).
- Hit rate was the entire point of `cache.ts` — the diff turns it from "near-permanent local kv store" into "best-effort warm-instance cache."

**Recommendation:** Treat the `/tmp` cache as a stopgap, not the long-term solution. The right fix is to back the cache with a shared store: Vercel KV / Upstash Redis / Vercel Blob would all preserve the existing `getCachedResult` / `setCachedResult` interface. At minimum, add a runtime warning at module init when `process.env.VERCEL` is set (e.g., `console.warn` in `dataDir.ts` or a one-line note logged from `getCachedResult` on first call) so the degraded behavior is observable in deploy logs. A decision record (`docs/decisions/NNN-llm-cache-storage.md`) capturing the tradeoff and the upgrade path would also be appropriate.

---

### 2. `appendFileSync` in a request handler on Vercel — sync I/O blocks the event loop

**Severity:** Medium
**Location:** `app/lib/analytics/persist.ts:17-20`
**Move:** Find work that moved to the wrong place (move 3) + Trace the memory lifecycle (move 4, marginal)
**Confidence:** Medium
**Path temperature:** Hot — called once per LLM call (`callLlm.ts:85, 213`, `streamLlm.ts:56, 149`), wrapped in try/catch.

This is **pre-existing** behavior — the diff does not change the `appendFileSync` call. But the user explicitly asked whether the redirection to `/tmp` introduces a new perf concern, so:

- `/tmp` on Vercel Functions is tmpfs-backed (memory-resident), so per-write latency is microseconds, not milliseconds. The sync write itself is not the bottleneck.
- However, `appendFileSync` still synchronously enters Node's libuv layer to perform `open`/`write`/`close` syscalls and blocks the JS event loop for that duration. On a tmpfs this is on the order of 100µs-1ms per call, which is negligible per-call but compounds when:
  - A streaming response is mid-flight: `appendFileSync` runs inside `recordAndCache` after the final SSE token, blocking the controller close path.
  - Multiple concurrent requests are served by the same Function instance under Fluid Compute / single-instance-multi-request mode, which Vercel now uses by default — they'll briefly serialize on the sync write.

Compared to the pre-Vercel world (writing to a real disk under `process.cwd()/data`), `/tmp` is actually faster, so the diff *improves* this. The remaining concern is that `appendFileSync` is a code-smell in any request path, sync-on-tmpfs or not; the rest of the codebase uses `fs/promises` (e.g. `cache.ts`).

**Recommendation:** Switch to `appendFile` from `fs/promises` and make `appendAnalyticsEntry` async. Wrap call sites in `try { await appendAnalyticsEntry(...) } catch {}` (they already have try/catch envelopes). Keeps the existing fire-and-forget semantics while removing the sync stall. Defer until the sibling cache-storage work is being done unless a hot-path latency regression shows up in production.

---

### 3. `existsSync` + `mkdirSync` on every analytics append

**Severity:** Low
**Location:** `app/lib/analytics/persist.ts:11-19`
**Move:** Count the hidden multiplications (move 1)
**Confidence:** High
**Path temperature:** Hot — same per-LLM-call frequency as Finding 2.

`appendAnalyticsEntry` calls `ensureDir()` on every invocation, which does `existsSync(DATA_DIR)` and conditionally `mkdirSync`. This is two extra syscalls per LLM call. On Vercel `/tmp` after a cold start the first call needs the `mkdirSync`; every subsequent call within that warm instance does the existsSync only.

Compare with `cache.ts:27-32` which already implements the right pattern: a module-level `dirEnsured` flag plus `mkdir(..., { recursive: true })` once per process. The diff did not introduce this divergence — it is pre-existing — but it is amplified slightly on Vercel because cold starts now reset both the flag *and* the directory state.

This is a constant-factor inefficiency, not algorithmic. Per-call overhead is sub-millisecond on tmpfs. Worth fixing for code consistency more than performance.

**Recommendation:** Mirror the `dirEnsured` boolean pattern from `cache.ts` in `persist.ts`, so the directory check is at most once per warm instance.

---

### 4. `/tmp` is bounded (~512 MB) and cache has no eviction — DoS-by-prompt-diversity is theoretically possible

**Severity:** Low
**Location:** `app/lib/llm/cache.ts:62-69`, `app/lib/utils/dataDir.ts:12-15`
**Move:** Trace the memory lifecycle (move 4) + Question the cache (move 8)
**Confidence:** Medium (depends on prompt-diversity assumptions)
**Path temperature:** Hot writer (`setCachedResult` called once per non-cached LLM call), but the failure mode is slow accumulation.

The cache writer has no eviction policy and no size cap. On the existing dev filesystem a 7.7 MB / 334-file cache is harmless. On Vercel `/tmp`:

- The 512 MB ceiling is shared with other writers (Next.js build artifacts, libraries that scratch to `/tmp`, the analytics jsonl, etc.). 512 MB / ~5 KB per cached JSON ≈ 100k entries before exhaustion; in practice the headroom is smaller because of co-tenants.
- Cold starts wipe the cache, which acts as an unintentional eviction policy — but a long-warm instance receiving high-diversity prompts could in principle fill `/tmp`.
- A failed `writeFile` due to ENOSPC is non-fatal (it's wrapped in try/catch in `recordAndCache`), so the symptom would be silent — no one would know the cache stopped writing.

For the current research/internal-tooling user base this is well below the realistic ceiling. Flagging as Low because the Vercel cold-start cycle effectively bounds it for now. Worth fixing as part of moving to a real cache backend (Finding 1) which would naturally have eviction.

**Recommendation:** When migrating off `/tmp` (Finding 1), pick a backend with a sensible eviction policy (KV with TTL, Redis with LRU, etc.). If staying on `/tmp` short-term, add a coarse size guard: log a warning when `setCachedResult` errors, so silent cache failures become visible.

---

### 5. Module-level `dataDir()` resolution — `process.env.VERCEL` read at import time

**Severity:** Informational
**Location:** `app/lib/analytics/persist.ts:8`, `app/lib/llm/cache.ts:7`
**Move:** Find work that moved to the wrong place (move 3) — confirming it is in the *right* place
**Confidence:** High
**Path temperature:** Cold — runs once per Node process at module load.

`DATA_DIR` and `CACHE_DIR` are computed at module import via `dataDir()`, which reads `process.env.VERCEL` once. This is the right place for the read — it doesn't repeat per request, doesn't allocate, and makes the path constant for the rest of the process lifetime. Test environments that need to override should do so via `process.env.VERCEL` before module import (or by mocking the `dataDir` import — `streamLlm.test.ts` already mocks `cache`/`persist` at the module boundary).

**Recommendation:** None. This is the correct shape. Documenting as a positive so it is not flagged in future reviews.

---

## What Looks Good

- **Hashing is computed once and reused** (`callLlm.ts:121`, `streamLlm.ts:95`). `computeHash` is not called twice per request.
- **Cache write is wrapped in try/catch and is non-fatal** (`callLlm.ts:94`, `streamLlm.ts:64`). A cache disk failure on Vercel does not break the user request — important given the increased likelihood of cache disappearance on `/tmp`.
- **`getCachedResult` returns null on read failure** (`cache.ts:56-59`) instead of throwing. Aligns well with cold-start eviction: an evicted entry naturally turns into a miss without special-casing.
- **`dataDir()` keeps the production/dev split inside one helper.** Both call sites (`persist.ts:8`, `cache.ts:7`) flow through it, so a future change (e.g., switching to a different writable path or to Vercel KV) is a single-file edit. Good factoring.
- **`process.env.VERCEL` check, not a homegrown env-name string.** Uses Vercel's documented system variable. Stable.

---

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 1 | Cache hit rate collapses on Vercel — cold-start + per-instance `/tmp` | High | `app/lib/llm/cache.ts:7`, `app/lib/utils/dataDir.ts:12-15` | High |
| 2 | `appendFileSync` in request handler — sync I/O on hot path (pre-existing, but Vercel context) | Medium | `app/lib/analytics/persist.ts:17-20` | Medium |
| 3 | `existsSync`+`mkdirSync` on every analytics append — duplicate of cache's `dirEnsured` pattern | Low | `app/lib/analytics/persist.ts:11-19` | High |
| 4 | Unbounded `/tmp` cache — no eviction, 512 MB ceiling, silent ENOSPC | Low | `app/lib/llm/cache.ts:62-69`, `app/lib/utils/dataDir.ts:12-15` | Medium |
| 5 | Module-level `dataDir()` resolution is in the right place | Informational | `app/lib/analytics/persist.ts:8`, `app/lib/llm/cache.ts:7` | High |

---

## Overall Assessment

The change itself is small and well-shaped — `dataDir()` is the minimum surgery to make the codebase boot on Vercel, and both consumers are routed through one helper, which makes future migration a single-file edit. The performance posture, however, is **functional but degraded on Vercel**: the LLM cache will work, but its hit rate will be a fraction of what it is on a persistent disk, and that hit rate is the difference between $0.003 and $0.40 on common formalization calls. The most important follow-up is **Finding 1** — plan a migration to a shared cache backend (Vercel KV, Upstash Redis, or Blob) and capture the decision in `docs/decisions/`. Findings 2-4 are pre-existing latent issues that the Vercel context highlights but does not materially worsen; they can be deferred and bundled with the cache-backend work. No profiling or benchmarking is needed to confirm Finding 1 — Vercel's `/tmp` semantics are public and the failure mode follows directly from them. Confirming the magnitude of the hit-rate drop in production would require log instrumentation (count cache hits vs misses per deploy), which would also serve as the success metric for the eventual migration.
