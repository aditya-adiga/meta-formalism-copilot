# Code Review Rubric — feat/vercel-deploy-button

**Scope:** `origin/main..HEAD` on `feat/vercel-deploy-button` | **Reviewed:** 2026-04-27 | **Status: ✅ PASSES REVIEW**

Commit at review time: `4329d6e` (post-simplifier)

---

## 🔴 Must Fix

| # | Finding | Domain | Location | Status |
|---|---|---|---|---|
| R1 | CLAUDE.md Deployment section claims Vercel writes go to `/tmp` and last for the warm container — but on this branch's main, both `persist.ts` and `cache.ts` write to `process.cwd()/data/...`, which is read-only on Vercel (writes throw `EROFS` and are silently swallowed by try/catch wrappers). The `/tmp` redirect lives only on `feat/vercel-filesystem-compat`. Convergence: fact-check (Incorrect, high) + api-consistency (Inconsistent). | Fact-check + API consistency | `CLAUDE.md:77` | ✅ Resolved — rewrote to describe current silent-write-failure behavior and treat the `/tmp` redirect as the next step rather than the current state. |
| R2 | README's "Analytics history is written to the local filesystem and does not persist across Vercel function invocations" has the same root cause leaking into user-facing docs — conclusion correct, mechanism wrong. | Fact-check (Mostly Accurate) + API consistency (Minor) | `README.md:120` | ✅ Resolved — rewrote to "writes to a cwd()-relative path that is read-only on Vercel, so the writes silently fail." |

---

## 🟡 Must Address

(none beyond 🔴 above)

---

## 🟢 Consider

| # | Finding | Source |
|---|---|---|
| C1 | `SIMULATE_STREAM_FROM_CACHE` is a real env var read by `streamLlm.ts` but absent from both env tables. Defensible omission (dev-only debug toggle), but worth a one-liner. | api-consistency-reviewer |
| C2 | Deploy URL `envDescription` ("get one at console.anthropic.com") and README row ("create a key with API access") drift — same destination, different sentences. Pick one phrasing. | api-consistency-reviewer |
| C3 | `.env.local` vs Vercel parity is implicit. Getting Started section never mentions `.env.local`/`ANTHROPIC_API_KEY`, leaving the dev-equivalence unstated. | api-consistency-reviewer |
| C4 | Pre-existing CLAUDE.md/README Node version mismatch (v18 vs v20). | api-consistency-reviewer | (Applied — bumped CLAUDE.md to Node.js 20+ to match README.) |
| C5 | OpenRouter privacy note doesn't disclose that the Anthropic path also sends source material to a third party — could be read as if Anthropic is privacy-preserving by comparison. Not a defect; optional polish. | security-reviewer |

C4 applied opportunistically. Others advisory.

---

## ✅ Confirmed Good

| Item | Verdict | Source |
|---|---|---|
| Deploy URL `repository-url` decodes to `https://github.com/aditya-adiga/meta-formalism-copilot` — matches the `origin` remote. No typo, no homoglyph fork risk. | ✅ Confirmed | security-reviewer |
| Env-var prompt scope is `ANTHROPIC_API_KEY` only. OpenRouter is fallback-only; Lean verifier URL is optional. Correctly deferred to "add later from Vercel dashboard" rather than required at deploy. | ✅ Confirmed | security-reviewer + code-fact-check |
| `envLink` resolves to README's own `#deploy-to-vercel` anchor; `envDescription` points at the real Anthropic console. Button image is vendor-controlled. | ✅ Confirmed | security-reviewer |
| No risky guidance — no "paste key in URL", no "commit `.env`", no "share key" patterns. CLAUDE.md explicitly forbids in-browser BYO-key flows. | ✅ Confirmed | security-reviewer |
| `OPENROUTER_API_KEY` description (fallback when ANTHROPIC unset) matches actual provider chain in `callLlm.ts:112-200` and `streamLlm.ts:87-137`. | ✅ Confirmed | code-fact-check |
| `LEAN_VERIFIER_URL` unset/unreachable behavior matches docs on this branch's main: silent mock-pass through pipeline. | ✅ Confirmed | code-fact-check |
| Bonus disclosure win: new wording is explicit ("reported as valid without actually being type-checked") where the old README only said "falls back to a mock response." | ✅ Confirmed | security-reviewer |
| Env-var naming follows codebase's SCREAMING_SNAKE_CASE vendor-prefixed convention. | ✅ Confirmed | api-consistency |
| Required/optional split correctly mirrors code behavior. | ✅ Confirmed | api-consistency |
| CLAUDE.md ends with explicit "update both files" invariant — drift-prevention. | ✅ Confirmed | api-consistency |
| 6 of 8 in-branch claims verified. | ✅ Confirmed | code-fact-check |

---

To pass review: all 🔴 items must be resolved. All 🟡 items must be either fixed or carry an author note. 🟢 items are optional.

**Status:** R1 + R2 resolved with code changes. C4 applied opportunistically. No blockers remain.

**Note on merge:** When this branch merges into `integration/4.27` (which already has `feat/lean-verifier-graceful-degradation` and `feat/vercel-filesystem-compat`), the verifier and persistence descriptions will conflict with the newer behavior already documented on integration. Take the integration-branch wording for those sections and keep the deploy-button-specific content (button, env-var tables, Deployment section) from this branch.
