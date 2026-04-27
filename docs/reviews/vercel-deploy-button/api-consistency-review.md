# API Consistency Review — feat/vercel-deploy-button

**Repository:** meta-formalism-copilot
**Branch:** feat/vercel-deploy-button
**Commit:** 4329d6ebb9717d1d4f5bbb81ad543554e8136f73
**Scope:** `git diff origin/main...HEAD` — README.md, CLAUDE.md (docs-only branch)
**Fact-check input:** `docs/reviews/vercel-deploy-button/code-fact-check-report.md`

---

## What "API surface" means here

This is a docs-only branch — no code changed. The relevant interface surface is the **deployment configuration contract**: the env vars a Vercel deployer is expected to set, the description text shown to them by Vercel, and the parallel descriptions in README and CLAUDE.md. The "consumers" are:

1. The deployer clicking the button (sees Vercel's env-var prompt populated from URL params).
2. A reader of the README (sees the env-var tables in `Deploy to Vercel`).
3. A future contributor reading CLAUDE.md (uses it as ground truth for what envs do).
4. A local dev setting `.env.local` (expects parity with the production env contract).

These four touchpoints all describe the same env vars. The review checks they agree.

---

## Baseline conventions

There is no formal env-var registry in this repo (no `.env.example`). The de-facto baseline is established by the four code call sites:

- `app/lib/llm/callLlm.ts:112-113` and `app/lib/llm/streamLlm.ts:87-88` read `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY`.
- `app/api/verification/lean/route.ts:4` reads `LEAN_VERIFIER_URL` (default `http://localhost:3100`).
- `app/lib/llm/streamLlm.ts:105` reads `SIMULATE_STREAM_FROM_CACHE` (string `"true"` toggle).
- `verifier/server.ts:9,15` reads `PORT` and `LEAN_PROJECT_DIR` (these only matter inside the Lean verifier container, not the Next.js app).

Naming convention: `SCREAMING_SNAKE_CASE`, vendor-prefixed where relevant (`ANTHROPIC_*`, `OPENROUTER_*`, `LEAN_*`). The README's deploy table follows this convention.

The only existing local env reference (`.env.local`) holds `ANTHROPIC_API_KEY`, a commented-out `OPENROUTER_API_KEY`, and a commented-out `SIMULATE_STREAM_FROM_CACHE=true` with explanatory text. The README/CLAUDE.md additions on this branch should be checked against this set.

---

## Findings

### Finding 1 — CLAUDE.md describes a `/tmp` write mechanism that doesn't exist in this branch

**Severity:** Inconsistent (with risk of misleading consumers)
**Location:** `CLAUDE.md:77` (the third bullet of the new Deployment section)
**Move:** #3 (Trace the consumer contract), #6 (Versioning impact / docs drift)
**Confidence:** High

CLAUDE.md states: "The LLM cache and analytics log write to the local filesystem in dev. Vercel Functions can only write to `/tmp` and that lasts only as long as the warm container — don't add features that assume durable filesystem state without an explicit storage backend."

The fact-check report (Claim 7) shows that on `feat/vercel-deploy-button` the code writes to `process.cwd()/data/...` (`app/lib/analytics/persist.ts:5-6`, `app/lib/llm/cache.ts:6`). On Vercel, `process.cwd()` is the read-only deployment filesystem — writes throw `EROFS`/`EACCES` and are swallowed by the surrounding `try/catch`. Nothing in this branch writes to `/tmp`. A `/tmp`-based fallback exists on the sibling `feat/vercel-filesystem-compat` branch but is not present here.

The consumer impact:

- A contributor reading CLAUDE.md will believe analytics/cache data lands in `/tmp` and survives the warm window. It doesn't — it never lands anywhere on Vercel. They may build features that assume "best-effort warm-container persistence" and get a silent zero-write reality.
- Anyone debugging "why is the analytics panel empty in production" will look in the wrong place.

This is the only true inconsistency between the documented deploy-time behavior and the actual code on this branch. The fact-check correctly flags it as Incorrect.

**Recommendation:** Replace the third bullet with something like: "The LLM cache and analytics log write to `process.cwd()/data/...` in dev. On Vercel, `process.cwd()` is read-only; the writes throw and are swallowed by `try/catch`, so the analytics panel and disk cache are effectively no-ops in production. Don't add features that depend on filesystem persistence without an explicit storage backend (Blob, KV, Postgres, etc.)." If the intent is to actually use `/tmp` — that change lives on `feat/vercel-filesystem-compat`, and either that branch should land first or this doc bullet should be deferred until it does.

---

### Finding 2 — README's `Limitations on Vercel` bullet for analytics describes the wrong failure mode

**Severity:** Minor
**Location:** `README.md:120`
**Move:** #3 (Trace the consumer contract)
**Confidence:** High

The README says analytics "is written to the local filesystem and does not persist across Vercel function invocations." The fact-check (Claim 8) flags this as "mostly accurate" — the conclusion (treat as dev-only) is right, but the mechanism is wrong. On Vercel the writes don't make it to ephemeral storage and then evaporate; they fail outright at the `appendFileSync` call against the read-only filesystem and are swallowed by the wrapping try/catch. From the deployer's perspective the difference is invisible (panel is empty either way), but from a contributor's perspective the framing primes the wrong mental model.

This is the same root cause as Finding 1, surfaced in the user-facing doc. Severity is lower because the user-facing conclusion ("treat as dev-only") is correct; only the explanation is misleading.

**Recommendation:** Tighten to "Analytics writes target a path that's read-only on Vercel and silently fail; the analytics panel will be empty in production. Treat it as dev-only."

---

### Finding 3 — `SIMULATE_STREAM_FROM_CACHE` is a real env var but unmentioned in either doc

**Severity:** Informational
**Location:** `README.md:104-115` (env-var tables), `CLAUDE.md:73-78` (Deployment section)
**Move:** #1 (Establish baseline conventions), #3 (Trace the consumer contract)
**Confidence:** High

The codebase reads four env vars in the Next.js app process: `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `LEAN_VERIFIER_URL`, `SIMULATE_STREAM_FROM_CACHE`. The first three appear in the README's deploy section; the fourth doesn't. It's documented inline in `.env.local` as "Set to 'true' to replay cached LLM results as simulated token streams. Useful for testing partial-JSON rendering without making API calls."

Whether this should appear in the Deploy section is a judgment call. It's a dev-only debug toggle — a deployer almost certainly shouldn't set it on a Vercel deployment. So omitting it from the deploy tables is defensible. But the section's framing ("Optional environment variables ... add these later from the Vercel dashboard") implies the table is exhaustive, and a reader trying to map `.env.local` keys to Vercel keys will hit this one and wonder.

This is informational, not a finding-finding — but worth a line of acknowledgment.

**Recommendation:** Either (a) add a short note at the bottom of the Optional table such as "Other env vars (e.g. `SIMULATE_STREAM_FROM_CACHE`) are dev-only debug toggles and should not be set on Vercel," or (b) leave as is and accept the asymmetry. (a) is preferred because it makes the table exhaustive at low cost.

---

### Finding 4 — README and deploy-button URL `envDescription` text drift slightly

**Severity:** Minor
**Location:** Deploy URL `envDescription` param vs `README.md:106`
**Move:** #2 (Naming/wording against the grain), #7 (Asymmetry)
**Confidence:** High

The deploy URL's `envDescription` decodes to:

> "Anthropic API key — get one at console.anthropic.com"

(uses an em-dash, no protocol on the URL).

The README's `Required environment variable` table row is:

> "https://console.anthropic.com — create a key with API access."

These are short sentences pointing at the same destination, but they say different things. The Vercel prompt tells the user to "get one at console.anthropic.com"; the README tells them to "create a key with API access" at `https://console.anthropic.com`. Neither is wrong, but a deployer who consults the README first and then sees the Vercel prompt second (or vice-versa) will see two different sentences and may wonder if there are two distinct steps.

The deploy URL also has `envLink` pointing back at the README's `#deploy-to-vercel` anchor, which is the right pattern — Vercel will render a link the deployer can click to read the README's fuller description. So the asymmetry is bounded: the short URL string is a teaser, the README is the canonical text. But making the two strings agree (or making the URL string a clear teaser of the README row) would reduce reader friction.

**Recommendation:** Either match the strings ("Anthropic API key — create one at console.anthropic.com" in both places) or accept the divergence as intentional (Vercel-prompt is a one-liner; README has the fuller "create a key with API access" instruction). Low-priority polish.

---

### Finding 5 — Dev-vs-Vercel env-setting is not made explicit

**Severity:** Minor / Informational
**Location:** `README.md:46-60` (Getting Started) and `README.md:98-120` (Deploy to Vercel)
**Move:** #3 (Trace the consumer contract), #7 (Asymmetry)
**Confidence:** Medium

The README's Getting Started section says "npm install / npm run dev" with no mention of `.env.local` or `ANTHROPIC_API_KEY`. The `Deploy to Vercel` section then introduces `ANTHROPIC_API_KEY` as the required env var. A first-time local-dev contributor has to figure out that the same env var is needed locally, in `.env.local`, and that the conventions are identical (same name, same format, set in `.env.local` for dev / Vercel project settings for prod).

The original (pre-this-branch) README has the same omission — this branch didn't introduce the gap. But because this branch *adds* an env-var contract, this is a natural moment to surface the dev-equivalence. Right now a deployer reading top-to-bottom can't tell whether `.env.local` is the dev equivalent of Vercel's env settings or whether dev uses some other mechanism.

**Recommendation:** Add one sentence to the `Getting Started` section: "For local development, copy `ANTHROPIC_API_KEY` (and any optional vars from the [Deploy to Vercel](#deploy-to-vercel) table) into a `.env.local` file at the repo root." Optionally check in a `.env.example` to make the contract concrete; this would also let the optional vars be discoverable without scrolling.

---

### Finding 6 — Node version mismatch between CLAUDE.md and README

**Severity:** Minor
**Location:** `CLAUDE.md:12` ("Node.js (v18+)") vs `README.md:50` ("Node.js 20+")
**Move:** #2 (Naming/wording against the grain)
**Confidence:** High

This is pre-existing on `main` and is not introduced by this branch — but the branch *did* edit CLAUDE.md and could have aligned the two. CLAUDE.md says v18+; README says 20+. Not strictly an env-var consistency finding, but it's the same class of "two docs describing the same thing differently" that the rest of this review catches. Worth a one-line fix while the doc is open.

**Recommendation:** Decide which is current (Vercel's Node 20 LTS default suggests `20+`) and align both. Out of scope for this PR if the author wants to keep it tight, but cheap to do here.

---

## What looks good

- **Env-var naming.** `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `LEAN_VERIFIER_URL` all follow the existing `SCREAMING_SNAKE_CASE`, vendor-prefixed convention. The README env tables match the names the code actually reads — no typos, no rename drift.
- **Deploy URL parameters are well-formed.** `repository-url`, `env`, `envDescription`, `envLink`, `project-name`, `repository-name` are all set; `envLink` correctly points back to the README's `#deploy-to-vercel` anchor so the deployer has a one-click path to fuller docs. Fact-check Claim 1 verifies the URL.
- **Required vs Optional separation is correct.** `ANTHROPIC_API_KEY` is in `Required` (the code falls through to mock without it); `OPENROUTER_API_KEY` and `LEAN_VERIFIER_URL` are in `Optional` (both are degraded-mode toggles). This matches how the code actually treats them.
- **Privacy note for OPENROUTER_API_KEY** is the kind of consumer-facing detail that's easy to omit. Good catch.
- **Lean verifier limitation** ("cannot run on Vercel; host it elsewhere") is accurate and honest. The fact-check confirms the unset/unreachable cases collapse to the same mock response (Claim 4), so the Limitations bullet is correct.
- **Verifier-offline UI claim** in CLAUDE.md is verified true (Claim 6) — there really is no offline UI state, and warning future contributors is the right call.
- **Cross-reference discipline.** CLAUDE.md ends with: "When changing user-facing setup steps, env vars, or deploy expectations, update both `README.md` (Deploy to Vercel section) and this file." This explicit invariant is exactly what prevents future drift between the four touchpoints. Worth keeping.

---

## Summary table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 1 | CLAUDE.md `/tmp` mechanism doesn't exist on this branch | Inconsistent | `CLAUDE.md:77` | High |
| 2 | README analytics-bullet describes wrong failure mode | Minor | `README.md:120` | High |
| 3 | `SIMULATE_STREAM_FROM_CACHE` is a real env var, unmentioned | Informational | `README.md:104-115`, `CLAUDE.md:73-78` | High |
| 4 | Deploy-URL `envDescription` text drifts from README row | Minor | URL param vs `README.md:106` | High |
| 5 | Dev `.env.local` parity with Vercel envs not made explicit | Minor | `README.md:46-60` | Medium |
| 6 | Node 18 vs Node 20 mismatch (pre-existing) | Minor | `CLAUDE.md:12` vs `README.md:50` | High |

---

## Overall assessment

The env-var contract is consistent across the three touchpoints that matter most to a deployer (deploy-button URL, README env-var tables, code call sites): same names, same casing, same required/optional split, accurate descriptions of what each one does. The fact-check corroborates this for Claims 1–6.

The one substantive problem is Finding 1: CLAUDE.md describes a `/tmp` filesystem-fallback mechanism that lives on a different branch, not this one. The framing implies a behavior the code doesn't have, which is the precise class of doc-vs-code drift API consistency review exists to catch. It's fixable in place — rewrite the bullet to describe what actually happens (writes target a read-only path on Vercel, throw, and are swallowed). Finding 2 is the same root cause leaking into the user-facing README and warrants the same fix.

The remaining findings (3–6) are polish: an undocumented dev-toggle env var, slightly drifted prompt-vs-README description text, an unspoken dev-equivalence with `.env.local`, and a pre-existing Node version disagreement. None block the PR; addressing them in this PR would tighten the contract further but isn't required.

Recommend: fix Findings 1 and 2 (or land `feat/vercel-filesystem-compat` first so they become correct as written); take Findings 3–6 as judgment calls.
