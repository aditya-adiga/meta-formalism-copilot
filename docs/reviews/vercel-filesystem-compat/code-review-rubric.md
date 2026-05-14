# Code Review Rubric — feat/vercel-filesystem-compat

**Scope:** `origin/main..HEAD` on `feat/vercel-filesystem-compat` | **Reviewed:** 2026-04-27 | **Status: ✅ PASSES REVIEW**

Commit at review time: `b64c1ca` (post-simplifier)

---

## 🔴 Must Fix

| # | Finding | Domain | Location | Status |
|---|---|---|---|---|
| R1 | `persist.ts:6-7` says "see Deploy to Vercel in README" but README has no such section on this branch's main. The section exists on `feat/vercel-deploy-button` only. Either drop the cross-reference or wait for ordering — convergence: fact-check (Incorrect) + api-consistency. Both 🟡 → escalated. | Fact-check + API consistency | `app/lib/analytics/persist.ts:6-7` | ✅ Resolved — dropped the README cross-ref; kept the dataDir() pointer which is self-contained. |

---

## 🟡 Must Address

| # | Finding | Domain | Source | Status | Author note |
|---|---|---|---|---|---|
| A1 | `dataDir()` docstring omits that `/tmp` is per-Function-instance — concurrent Vercel Function instances each see their own divergent contents. Materially affects analytics correctness on Vercel. | Fact-check (Mostly Accurate) + api-consistency | code-fact-check + api-consistency | ✅ Resolved — added per-instance caveat to docstring and to persist.ts comment. |
| A2 | Inconsistent rest-args usage between consumers: `cache.ts` used `dataDir("cache")` (rest-args) while `persist.ts` used `join(dataDir(), "...")`. Codebase convention is "module-scope base const + join at callsite". | API consistency (Inconsistent) | api-consistency | ✅ Resolved — dropped the rest-args feature from `dataDir()`. Both consumers now use `join(dataDir(), "...")`. Also kills the dead-code `subpaths.length > 0` guard. |
| A3 | Cache hit rate collapses on Vercel — `/tmp` is wiped on cold start AND per-instance, so the cache degrades from "near-permanent local kv" to "best-effort warm-instance only." Cost impact is real ($0.003-$0.40+ per formalization call; cache is the only thing standing between repeat user actions and full re-billing). | Performance (High) | performance-reviewer | 🟡 Deferred | Out of scope for this branch's "make writes not crash" goal. Migration to Vercel KV / Upstash / Blob is the proper fix; cache interface already abstracted, so it's a focused follow-up. Tracked separately. |
| A4 | `dataDir()` has no test despite encoding an asymmetric deploy invariant (Vercel branch invisible to local dev/build/lint). | Test-strategy | test-strategy-reviewer | ✅ Resolved — added `dataDir.test.ts` with 3 cases pinning both branches and a non-empty truthy variant. |

---

## 🟢 Consider

| # | Finding | Source |
|---|---|---|
| C1 | `appendFileSync` blocks the event loop on the analytics hot path. Pre-existing on main; on Vercel `/tmp` (tmpfs) per-call cost is ~100µs-1ms. Worth converting to async `appendFile`. | performance-reviewer |
| C2 | `existsSync`+`mkdirSync` runs on every analytics append. `cache.ts` already implements the right pattern (a `dirEnsured` flag); `persist.ts` should mirror it. Pre-existing. | performance-reviewer |
| C3 | `/tmp` is bounded at ~512 MB and the cache has no eviction. Cold-start wipes act as unintentional eviction so unlikely to ENOSPC in practice; failures are silent (try/catch already wraps). Address as part of cache-backend migration. | performance-reviewer |
| C4 | Late-bound `process.env.VERCEL` read on every call to `dataDir()` diverges from module-scope env-read convention used elsewhere. Tiny perf cost (env reads are fast), but inconsistent. | api-consistency-reviewer |
| C5 | `dataDir` is noun-shaped; `app/lib/utils/` is uniformly verb-led (`triggerDownload`, `parseLatexPropositions`, `loadWorkspace`). `getDataDir`/`resolveDataDir` would fit better. | api-consistency-reviewer |
| C6 | Defense-in-depth: `dataDir` could reject `..`, `/`, `\`, `\0` in segments if rest-args ever returns. Currently no callers pass user-derived paths — informational. | security-reviewer |
| C7 | Pre-existing: `/api/analytics` is unauthenticated. Metadata-only and per-Function-instance now, but still worth a deployer-facing note. | security-reviewer |

C1, C2 are pre-existing performance opportunities. Others are advisory.

---

## ✅ Confirmed Good

| Item | Verdict | Source |
|---|---|---|
| `process.env.VERCEL` is set on Vercel (Build / Preview / Production / Development) | ✅ Confirmed | code-fact-check (per Vercel docs) |
| `/tmp` is the only writable path on Vercel Functions (deployed bundle is read-only) | ✅ Confirmed | code-fact-check (per Vercel docs) |
| Vercel Functions run in per-customer Firecracker microVMs (AWS Lambda); `/tmp` is sandbox-isolated, not shared with other customers | ✅ Confirmed | security-reviewer |
| `appendFileSync` is atomic under PIPE_BUF for `O_APPEND`; within-instance concurrent appends are safe | ✅ Confirmed | security-reviewer |
| LLM cache files contain only the response + usage metadata; user prompts/system prompts only contribute to the SHA-256 hash filename | ✅ Confirmed | security-reviewer |
| `dataDir()` covers all current disk-writers in the app — no missed sites | ✅ Confirmed | api-consistency |
| `/tmp` (tmpfs) is faster than dev disk; redirect is not the latency concern | ✅ Confirmed | performance-reviewer |
| 3 of 6 in-branch claims fully verified (rest are external/unverifiable) | ✅ Confirmed | code-fact-check |

---

To pass review: all 🔴 items must be resolved. All 🟡 items must be either fixed or carry an author note. 🟢 items are optional.

**Status:** R1 + A1 + A2 + A4 resolved. A3 carries author note (deferred to follow-up). No blockers remain.
