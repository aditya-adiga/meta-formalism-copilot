# Code Fact-Check Report

**Repository:** meta-formalism-copilot
**Branch:** feat/vercel-filesystem-compat
**Commit:** b64c1cade4a69a4a5154f6cd67aa30ce7cf8841b
**Scope:** `git diff origin/main...HEAD` (3 files changed)
**Checked:** 2026-04-27
**Total claims checked:** 6
**Summary:** 3 verified, 1 mostly accurate, 1 incorrect, 1 unverifiable

Files in scope:
- `app/lib/utils/dataDir.ts` (new)
- `app/lib/analytics/persist.ts`
- `app/lib/llm/cache.ts`

---

## Claim 1: "On Vercel Functions only `/tmp` is writable"

**Location:** `app/lib/utils/dataDir.ts:7`
**Type:** Configuration / Behavioral (platform invariant)
**Verdict:** Verified
**Confidence:** High

This claim describes external Vercel platform behavior, not in-repo code. The repo cannot internally verify the platform constraint, but it is a long-standing, well-documented Vercel Functions invariant: the deployed bundle is on a read-only filesystem and only `/tmp` (a per-instance ephemeral scratch space, ~512 MB) is writable. The user-supplied prompt confirms this matches Vercel's published documentation.

The implementation in this branch is consistent with that constraint: when `process.env.VERCEL` is truthy, both `dataDir()` and the analytics/cache paths route under `/tmp`, and otherwise route under `process.cwd()/data`. No code in the diff attempts to write outside `/tmp` on Vercel.

**Evidence:** `app/lib/utils/dataDir.ts:13`, `app/lib/analytics/persist.ts:8-9`, `app/lib/llm/cache.ts:7`

---

## Claim 2: "[`/tmp`] lives only as long as the warm container — so persistence does not survive cold starts"

**Location:** `app/lib/utils/dataDir.ts:7-9`
**Type:** Behavioral (platform invariant)
**Verdict:** Mostly accurate
**Confidence:** High

The directionally correct version of the Vercel `/tmp` lifecycle is:

1. Files written to `/tmp` persist within a warm Function instance and are visible to subsequent requests served by that **same** instance.
2. They do **not** survive cold starts — when a new Function instance boots, its `/tmp` is empty.
3. They are also not shared across concurrent instances. Multiple regions / concurrent invocations each get their own `/tmp`, so even without a cold start, two requests routed to different instances will see different contents.

The comment captures (1) and (2) correctly. It omits (3), which matters here because:
- `appendAnalyticsEntry` (`persist.ts:17-20`) uses `appendFileSync` to a shared `analytics.jsonl`. Concurrent Function instances on Vercel will produce divergent local `analytics.jsonl` files, not a unified history.
- `getCachedResult` / `setCachedResult` (`cache.ts:34-69`) will produce per-instance caches, so cache hit-rate is bounded by per-instance reuse rather than global reuse.

The comment is "mostly accurate" rather than "verified" because a reader could conclude that within a single warm container all writes accumulate as on a normal disk, when in practice the multi-instance fan-out means even warm-container persistence is partial.

**Suggested tightening:** "...does not survive cold starts, and `/tmp` is per-instance — concurrent Function instances do not share state."

**Evidence:** `app/lib/utils/dataDir.ts:7-13`, `app/lib/analytics/persist.ts:17-20`, `app/lib/llm/cache.ts:34-69`

---

## Claim 3: "In dev and self-hosted deployments we write to the repo's `data/` dir for durable cross-restart storage."

**Location:** `app/lib/utils/dataDir.ts:9-10`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

When `process.env.VERCEL` is unset, `dataDir()` returns `join(process.cwd(), "data")` and `dataDir("cache")` returns `join(process.cwd(), "data", "cache")`. `appendAnalyticsEntry` calls `mkdirSync(DATA_DIR, { recursive: true })` before each append (`persist.ts:11-15, 17-20`), and the cache module calls `mkdir(CACHE_DIR, { recursive: true })` once per process via `ensureCacheDir` (`cache.ts:27-32`). Both write under that base path with `appendFileSync` / `writeFile`, which produce durable, cross-restart files on a normal filesystem.

The "durable cross-restart storage" qualifier is correct in the dev/self-hosted case: those writes land on the host's regular disk, which survives Node process restarts.

**Evidence:** `app/lib/utils/dataDir.ts:12-15`, `app/lib/analytics/persist.ts:11-20`, `app/lib/llm/cache.ts:27-69`

---

## Claim 4: "Resolve a writable directory for server-side persistence (analytics, LLM cache, etc.)."

**Location:** `app/lib/utils/dataDir.ts:3-4`
**Type:** Architectural
**Verdict:** Verified
**Confidence:** High

`dataDir()` is imported and used by exactly the two server-side persistence modules named: `app/lib/analytics/persist.ts:4` and `app/lib/llm/cache.ts:4`. Both are server-only (they import from `node:fs` / `node:fs/promises`). No client-side code imports `dataDir`. The "etc." leaves room for future callers, which is consistent with the helper's design.

**Evidence:** `app/lib/analytics/persist.ts:4,8`, `app/lib/llm/cache.ts:4,7`

---

## Claim 5: "On Vercel, analytics history doesn't persist across cold starts — see Deploy to Vercel in README."

**Location:** `app/lib/analytics/persist.ts:6-7`
**Type:** Reference (cross-doc pointer) + Behavioral
**Verdict:** Incorrect
**Confidence:** High

Two sub-claims:

1. **"Analytics history doesn't persist across cold starts."** — Verified. `DATA_DIR` resolves to `/tmp` on Vercel (`persist.ts:8` -> `dataDir()` -> `/tmp` when `process.env.VERCEL` is set), and Vercel's `/tmp` is wiped on cold start. The behavioral half of the claim is correct (with the same multi-instance caveat called out in Claim 2).

2. **"See Deploy to Vercel in README."** — Incorrect. The branch does not add a "Deploy to Vercel" section to the README, and `README.md` contains no occurrence of the strings "Vercel" or "Deploy" (verified via grep). The cross-reference points at a section that does not exist.

This is a Reference claim that fails because the referenced target is missing. Either the README section needs to be added in this PR, or the comment should be rewritten to point at `dataDir()` only (which it already does in its second sentence) and drop the README reference.

**Evidence:** `app/lib/analytics/persist.ts:6-8`, `README.md` (no `vercel`/`deploy` matches), `app/lib/utils/dataDir.ts:12-15`

---

## Claim 6: "See `dataDir()` for the underlying rationale."

**Location:** `app/lib/analytics/persist.ts:7`
**Type:** Reference
**Verdict:** Verified
**Confidence:** High

`dataDir()` is defined at `app/lib/utils/dataDir.ts:12` with a JSDoc block (`dataDir.ts:3-11`) that explains the Vercel `/tmp` rationale. The reference target exists, is in the same PR, and contains the rationale described.

**Evidence:** `app/lib/utils/dataDir.ts:3-15`

---

## Out-of-scope verifications requested by the orchestrator

The orchestrator asked four questions about Vercel platform behavior. These are not in-repo claims, but for completeness:

- **Is `process.env.VERCEL` actually set on Vercel?** Per Vercel's documented system environment variables, `VERCEL=1` is set in Build, Preview, Production, and Development environments running on Vercel. **Unverifiable from the codebase alone**, but consistent with Vercel's public docs as cited in the prompt. Confidence: high (external).
- **Is `/tmp` actually the only writable path on Vercel Functions?** Per Vercel's Functions docs, yes — the deployed bundle is on a read-only filesystem and `/tmp` is the only writable location, capped at ~512 MB. **Unverifiable from the codebase alone**, consistent with public docs. Confidence: high (external).
- **Does `/tmp` survive across requests?** Yes within a warm Function instance, no across cold starts, and not shared across concurrent instances. **Unverifiable from the codebase alone**, consistent with public docs. Confidence: high (external).
- **Are the comment claims about cross-cold-start persistence accurate?** See Claims 2 and 5 above. The cold-start half is accurate; the comments under-specify the per-instance caveat, and the README cross-reference in Claim 5 points at a non-existent section.

---

## Claims Requiring Attention

### Incorrect
- **Claim 5** (`app/lib/analytics/persist.ts:6-7`): Comment references a "Deploy to Vercel" section in README that does not exist. Either add the README section in this PR or drop/replace the cross-reference.

### Mostly Accurate
- **Claim 2** (`app/lib/utils/dataDir.ts:7-9`): JSDoc describes `/tmp` lifecycle accurately for cold starts but omits that `/tmp` is per-instance, which matters for analytics (concurrent Functions produce divergent JSONL files) and cache hit-rate.

### Unverifiable (external platform claims)
- Vercel platform invariants (`process.env.VERCEL` set, `/tmp` writable, `/tmp` per-warm-instance) are consistent with Vercel's public documentation but cannot be verified from the codebase alone.
