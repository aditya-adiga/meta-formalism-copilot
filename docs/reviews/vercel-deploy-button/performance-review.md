# Performance Review — feat/vercel-deploy-button

Commit: 4329d6ebb9717d1d4f5bbb81ad543554e8136f73
Scope: `git diff origin/main...HEAD` — `README.md` and `CLAUDE.md` only.

> No code-fact-check report was provided for this branch's diff, but the diff contains
> no executable code paths to fact-check. Performance analysis below is based purely
> on the documented deployment expectations.

## Data Flow and Hot Paths

This is a documentation-only branch. No source files, build config, runtime code, or
infrastructure-as-code is modified. The diff:

- Adds a Vercel Deploy button and a "Deploy to Vercel" section to `README.md`,
  documenting `ANTHROPIC_API_KEY` (required), `OPENROUTER_API_KEY` (optional fallback),
  and `LEAN_VERIFIER_URL` (optional, off-platform).
- Adds a "Deployment" section to `CLAUDE.md` describing the self-hosted single-tenant
  trust model, the Lean verifier mock-fallback behavior, and Vercel's `/tmp`-only
  filesystem constraint for the LLM cache and analytics log.
- Restates the existing Lean verifier mock-fallback behavior in two places in `README.md`
  for clarity.

Nothing in the diff changes call frequency, data sizes, algorithmic complexity, memory
lifecycle, locking, caching behavior, serialization, or query patterns. There is no
runtime performance signal to review.

## Findings

None at the code level. The cognitive moves (hidden multiplications, N sizing, work
relocation, memory lifecycle, DB patterns, serialization tax, contention, caching,
asymptotic behavior) all require executable code to evaluate, and this diff has none.

For completeness, the deployment patterns the docs **describe** (not introduce) have
the following performance-adjacent properties. These are not findings against this
diff — they are pre-existing characteristics the docs accurately surface, and are
called out here only because the task asked specifically about deployment patterns
with perf implications:

- **Cold starts on Vercel Functions.** Each API route under `app/api/` becomes a
  serverless function. First-hit latency includes container cold-start plus Anthropic
  SDK initialization. The docs do not change this; they correctly note that durable
  filesystem state cannot be assumed across invocations. No action.
- **`/tmp`-scoped LLM cache and analytics log.** The new `CLAUDE.md` text explicitly
  documents that the existing filesystem-backed LLM cache and analytics log will not
  persist across warm-container boundaries on Vercel. Hit rate on a fresh container
  is zero, so the cache provides per-warm-container deduplication only. This is a
  known limitation of the existing implementation, surfaced (not introduced) by this
  diff. No action required for this PR; if cache hit rate matters for cost, that
  belongs in a separate change adding a real backend (KV / Redis).
- **Off-platform Lean verifier.** `LEAN_VERIFIER_URL` points at a separately hosted
  Docker service. The cross-network round trip per verification is inherent to the
  architecture, not a regression. No action.
- **Region selection / function timeouts.** The docs do not pin a region or timeout.
  Vercel's defaults apply. Long Anthropic streaming completions can approach the
  default 10s Hobby / 60s Pro function timeout, but this is independent of the
  documentation change. No action for this PR.

## What Looks Good

- The docs honestly disclose the Lean verifier mock-fallback ("reported as valid
  without actually being type-checked"), the OpenRouter privacy implication, and
  the non-persistent analytics. A reviewer can decide whether to deploy with eyes
  open. From a reliability/perf-posture standpoint this is the right framing.
- The single-tenant trust boundary described in `CLAUDE.md` keeps the deployment
  model simple — no multi-tenant rate-limiting / quota / contention concerns are
  introduced.

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| — | No performance findings — docs-only diff | n/a | n/a | High |

## Overall Assessment

Docs-only branch. Nothing to review for performance — no code paths change, no call
frequencies change, no data structures change. The documentation accurately describes
pre-existing constraints (Vercel `/tmp` filesystem, off-platform Lean verifier,
serverless cold starts implied by the platform choice) without introducing new
performance behavior. Ship it from a perf perspective; no profiling or benchmarking
is warranted by this diff.
