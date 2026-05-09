# Security Review: vercel-filesystem-compat

**Repository:** meta-formalism-copilot
**Branch:** feat/vercel-filesystem-compat
**Commit:** b64c1cade4a69a4a5154f6cd67aa30ce7cf8841b
**Scope:** `git diff origin/main...HEAD` (3 files: `app/lib/utils/dataDir.ts` (new), `app/lib/analytics/persist.ts`, `app/lib/llm/cache.ts`)
**Reviewed:** 2026-04-27
**Fact-check input:** `docs/reviews/vercel-filesystem-compat/code-fact-check-report.md` (used as foundation for behavioral claims)

---

## Trust Boundary Map

The diff introduces a single helper, `dataDir(...subpaths)`, that returns either `/tmp` (when `process.env.VERCEL` is set) or `<repo>/data` otherwise. Two production callers consume it:

1. **LLM cache (`app/lib/llm/cache.ts`)** — derives a deterministic SHA-256 hash from `(model, systemPrompt, userContent, maxTokens)` and writes/reads `<base>/cache/<hex-hash>.json` containing `{ text, usage }`. `text` is the LLM response. `userContent` (which can contain user-uploaded source material and prompts) is NOT itself stored on disk; only its hash appears in the filename and the LLM-generated response body is written.
2. **Analytics (`app/lib/analytics/persist.ts`)** — appends a JSON line per LLM call to `<base>/analytics.jsonl`. The line contains `{ id, endpoint, provider, model, inputTokens, outputTokens, costUsd, latencyMs, timestamp }` — no prompts, no responses, no user identifiers.

Trust transitions in scope of this diff:

- **External → server filesystem.** User-driven HTTP requests indirectly cause writes via the LLM call path. The path itself never includes user input — only hardcoded literals (`"cache"`) and a SHA-256 hex string.
- **Server filesystem → external (read-back).** `GET /api/analytics` returns all analytics entries to any caller. `DELETE /api/analytics` clears them. Both are unauthenticated. This is pre-existing behavior, not introduced by this diff, but the diff changes *where* that data lives (now `/tmp` on Vercel) which is worth noting.
- **`/tmp` isolation domain.** On Vercel Functions each invocation runs inside a dedicated Firecracker microVM (AWS Lambda execution environment); `/tmp` is per-instance ephemeral storage scoped to the function's own sandbox. It is NOT shared with other Vercel customers nor with co-tenant containers on the same physical host. Within a single warm instance, however, it is shared across all requests routed to that instance — i.e., the same trust domain as the application's own code.

---

## Findings

#### No path traversal risk in `dataDir(...subpaths)`

**Severity:** Informational
**Location:** `app/lib/utils/dataDir.ts:12-15`
**Move:** #2 (Implicit sanitization assumption), #1 (Trust boundaries)
**Confidence:** High

The variadic `subpaths` parameter could in principle accept attacker-controlled values that contain `..` segments and escape the base directory (`path.join("/tmp", "..", "etc/passwd")` resolves to `/etc`). I traced every caller of `dataDir(...)` in the repo:

- `app/lib/llm/cache.ts:7` — `dataDir("cache")` (literal string, not user-controlled)
- `app/lib/analytics/persist.ts:8` — `dataDir()` (no subpaths)

No production code path passes user input to `dataDir`. The cache filename downstream of `CACHE_DIR` is `${hash}.json` where `hash` is a 64-character hex SHA-256 digest from `computeHash` (`cache.ts:16-25`) — also not traversable.

This is not currently exploitable, but the helper is a footgun for future callers who might pass a user-supplied identifier as a subpath. See the recommendation under "Defense-in-depth: harden `dataDir` against future callers" below.

**Recommendation:** Optional: add a defensive check inside `dataDir` that rejects subpath segments containing `..`, path separators, or NUL bytes, e.g. `if (subpaths.some(s => s.includes("..") || s.includes("/") || s.includes("\\") || s.includes("\0"))) throw new Error("Invalid subpath")`. This is purely defense-in-depth; the current callers are safe.

---

#### Unauthenticated read of LLM analytics history

**Severity:** Low (Medium if endpoint becomes public-facing)
**Location:** `app/api/analytics/route.ts:4-12`
**Move:** #5 (Invert the access control model)
**Confidence:** High

Pre-existing, not introduced by this diff, but the diff materially affects its threat model. `GET /api/analytics` returns every analytics entry; `DELETE /api/analytics` wipes them. There is no auth check, no middleware, no rate limit — anyone able to reach the deployment can read or clear analytics.

The data exposed is metadata only (model, provider, token counts, cost, latency, timestamp, endpoint name) — no prompts, no responses, no user identifiers. So the disclosure impact is bounded: an attacker learns approximate usage patterns and aggregate cost/token volume per endpoint, which can inform reconnaissance (e.g., which endpoints are expensive, when traffic spikes happen) and can drain analytics history with `DELETE`.

The diff is relevant because on Vercel the analytics file now lives in per-instance `/tmp` and is ephemeral; the practical cost of `DELETE` from an attacker's perspective is low (they wipe at most one warm-instance's worth of data), and the cost of `GET` is similarly bounded. So Vercel migration arguably *reduces* the impact compared to a self-hosted persistent file. That said, it does not eliminate the access-control gap.

**Recommendation:** If this app is deployed publicly (preview URLs, production) with no edge auth in front of it, gate `/api/analytics` behind the same auth as the rest of the app (or `NEXT_PUBLIC` admin gating + a server-side header check). At minimum, gate `DELETE` more strictly than `GET`. If the deployment is intended for internal/local use only, document that explicitly so deployers don't expose it accidentally.

---

#### Cached LLM responses readable by all code in the same warm instance

**Severity:** Low
**Location:** `app/lib/llm/cache.ts:62-69`, `app/lib/utils/dataDir.ts:13`
**Move:** #6 (Follow the secrets — applied to user data), #1 (Trust boundaries)
**Confidence:** High

On Vercel, cached LLM responses are written under `/tmp/cache/<hash>.json`. Within a single warm Function instance, that data is accessible to all code running in the same sandbox — but the sandbox is single-tenant (your code only), isolated per-customer at the microVM level, and not shared with other Vercel customers. So "anyone with read access on the same instance" reduces to "your own application code on the same warm instance," which is already in the same trust domain.

Two residual exposures worth naming:

1. **Cache poisoning across requests on the same warm instance.** Because the cache key is a deterministic hash of `(model, systemPrompt, userContent, maxTokens)`, two different users who happen to submit identical inputs will share a cache entry. The response cached for user A will be served to user B. This is by design for a content-addressed cache, but it does mean the cache is a per-instance cross-user shared resource. If responses ever become user-specific (e.g., contain "Hello, $name"), this would leak user A's name to user B. Today the LLM call signature is purely content-derived — verified at `callLlm.ts:120-122` — so this is informational.

2. **Process-level read access.** The cache files have default umask permissions (likely 0644). On Vercel this doesn't matter since the sandbox is single-tenant, but if anyone runs the same code self-hosted in a multi-user environment (the non-Vercel branch of `dataDir`, which writes to `<cwd>/data`), other local users could read the cache. Self-hosted multi-tenant deployments are not a stated use case, but worth noting.

**Recommendation:** Document explicitly in `dataDir.ts` JSDoc that `/tmp` on Vercel is single-tenant and not shared across customers, so reviewers don't have to re-derive that. For (1), if the cache is ever extended to include user-personalized prompts, switch to per-user cache scoping. For (2), self-hosted deployers should run the app under a dedicated user account.

---

#### No cleanup of `/tmp` cache or analytics files

**Severity:** Low
**Location:** `app/lib/llm/cache.ts:62-69`, `app/lib/analytics/persist.ts:17-20`
**Move:** #8 ("What if there are a million of these?")
**Confidence:** High

Neither the cache nor the analytics writer enforces a size or age limit. A warm Function instance with many distinct LLM requests could accumulate cache files indefinitely until either (a) the instance cold-starts and `/tmp` is wiped, or (b) `/tmp` hits Vercel's ~512 MB cap and writes start failing.

Failure modes when `/tmp` fills:
- `setCachedResult` failures are caught and silently ignored (`callLlm.ts:94`, `streamLlm.ts:64`) — non-fatal.
- `appendAnalyticsEntry` failures are caught and silently ignored (`callLlm.ts:91`, `streamLlm.ts:62`) — non-fatal.

So a full `/tmp` does not break LLM calls, but it does mean analytics and cache stop working without any visible signal. From a security standpoint, this is denial-of-service-resistant (the primary path keeps working) but it is a silent reliability regression.

There is no separate "leak across users" risk from leftover `/tmp` files, because each Vercel customer's `/tmp` is sandbox-isolated; when a microVM is reused for another invocation of *the same customer's* function it still belongs to the same trust domain, and when the microVM is recycled/killed the storage is destroyed.

**Recommendation:** Add a soft cap on cache files (e.g., LRU eviction at N entries or M MB) and on analytics file size. Even a coarse `if (statSync(FILE_PATH).size > MAX) rotate()` is enough. Consider logging (not silently swallowing) ENOSPC errors so operators notice when `/tmp` fills.

---

#### No race-condition risk from `/tmp` cross-tenancy

**Severity:** Informational (resolves a question raised in scope)
**Location:** `app/lib/utils/dataDir.ts:13`
**Move:** #4 (TOCTOU), #1 (Trust boundaries)
**Confidence:** High

The scoping prompt asked whether `/tmp` is shared across the OS user such that other tenants/processes on the same Vercel container could read what we write. The answer is no: Vercel Functions run on AWS Lambda, which uses Firecracker microVMs to isolate each customer's execution environment. `/tmp` is part of that isolated sandbox. Co-tenants on the same physical host cannot reach our `/tmp`.

There is, however, a within-instance race relevant to `appendAnalyticsEntry` (`persist.ts:17-20`) regardless of Vercel. `appendFileSync` with `O_APPEND` is atomic for writes up to `PIPE_BUF` (4096 bytes on Linux), and a serialized AnalyticsEntry is well under that, so concurrent appends from parallel async handlers within one instance will not corrupt lines. This is fine. `clearAnalyticsEntries` (`persist.ts:37-40`) is not race-free vs. concurrent appends — a clear that interleaves with an append could lose the latest entry — but the impact is loss of debug data, not a security issue.

**Recommendation:** None for security. Worth noting in code comments that `appendFileSync` is the correct choice here precisely because of `O_APPEND` atomicity for sub-PIPE_BUF writes — that's why the code looks safe even under concurrency.

---

## What Looks Good

- **Cache filenames are SHA-256 hex digests, not user input.** This eliminates path-traversal risk through the most natural attack surface (hash collisions in SHA-256 are not a concern, and the digest is constrained to `[0-9a-f]{64}`).
- **Cache contents do NOT include the user-provided `userContent` or `systemPrompt`.** Only the response `text` and `usage` metadata are written to disk. The mapping from input to response file goes through a one-way hash. This is exactly the right design for a content-addressed cache that may persist user data indirectly: an attacker who reads `/tmp/cache/*.json` learns the responses but cannot easily reconstruct what was asked (without already having candidate prompts to hash).
- **Analytics payloads contain no PII or content.** `AnalyticsEntry` (`app/lib/types/analytics.ts:18-29`) is strictly metadata: provider, model, token counts, cost, latency, timestamp, endpoint name. Even if the analytics file were exfiltrated, no prompts or responses leak.
- **Persistence failures are non-fatal.** Both `setCachedResult` and `appendAnalyticsEntry` are wrapped in `try/catch` at the call site (`callLlm.ts:91, 94`; `streamLlm.ts:62, 64`), so a full or read-only `/tmp` does not break the LLM flow. This is the correct error-path posture.
- **Branching on `process.env.VERCEL` is safe.** `process.env.VERCEL` is set by the Vercel build/runtime to `1`. It is not user-controllable in any reasonable threat model (an attacker who can set process env on the deployed Function already owns the function). The fallback to `<cwd>/data` for non-Vercel is benign.
- **No new dependencies.** The diff adds no packages, so no supply-chain review needed (cognitive move #10).

---

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 1 | No path traversal risk in `dataDir(...subpaths)` (informational; harden for future) | Informational | `app/lib/utils/dataDir.ts:12-15` | High |
| 2 | Unauthenticated read/delete of analytics history (pre-existing; impact reduced by `/tmp`) | Low | `app/api/analytics/route.ts:4-12` | High |
| 3 | Cached LLM responses readable within the same warm instance (single-tenant, but document) | Low | `app/lib/llm/cache.ts:62-69` | High |
| 4 | No cleanup/rotation of `/tmp` cache or analytics files (silent reliability regression at cap) | Low | `app/lib/llm/cache.ts:62-69`, `app/lib/analytics/persist.ts:17-20` | High |
| 5 | No race/cross-tenancy risk from `/tmp` (resolves a scoping question) | Informational | `app/lib/utils/dataDir.ts:13` | High |

---

## Overall Assessment

This diff is **safe to merge from a security standpoint.** The scoping questions raised in the prompt — path traversal, cross-tenant `/tmp` reads, file permissions, leakage of user prompts — all resolve to "not exploitable" given (a) Vercel's per-customer microVM isolation of `/tmp`, (b) the absence of user input on the path-construction side of `dataDir`, and (c) the design choice to write responses indexed by hash rather than to write raw prompts.

The most actionable item is the pre-existing, unauthenticated `/api/analytics` GET/DELETE endpoint (Finding 2). It is not introduced by this diff, but the diff is a reasonable place to either gate it or document deployment expectations. If the maintainer's intent is "this is a single-tenant tool deployed by individuals for their own use," the current posture is acceptable; if it could end up on a publicly-reachable Vercel preview, the endpoint should be gated.

A small defense-in-depth improvement worth doing inline with this PR: reject `..` and path separators in `dataDir`'s `subpaths`, since the helper signature invites a future caller to pass user input. Cost is two lines; benefit is "a path-traversal CVE in this codebase will need to break two layers, not one."
