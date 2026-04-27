# Code Fact-Check Report

**Repository:** meta-formalism-copilot
**Branch:** feat/vercel-deploy-button
**Commit:** 4329d6ebb9717d1d4f5bbb81ad543554e8136f73
**Scope:** `git diff origin/main...HEAD` — README.md, CLAUDE.md (docs-only branch)
**Checked:** 2026-04-27
**Total claims checked:** 8
**Summary:** 6 verified, 1 mostly accurate, 0 stale, 1 incorrect, 0 unverifiable

---

## Claim 1: Deploy button URL points at the right repo and prompts for the right env var

**Location:** `README.md:5`
**Type:** Configuration
**Verdict:** Verified
**Confidence:** High

The deploy URL contains:
- `repository-url=https%3A%2F%2Fgithub.com%2Faditya-adiga%2Fmeta-formalism-copilot` — matches `origin` remote (`https://github.com/aditya-adiga/meta-formalism-copilot.git`).
- `env=ANTHROPIC_API_KEY` — single required env var, matches the table on `README.md:108`.
- `envLink` points back into the README's Deploy-to-Vercel anchor.
- `project-name`/`repository-name=metaformalism-copilot`.

All parameters resolve correctly.

**Evidence:** `README.md:5`, `git remote -v`

---

## Claim 2: "ANTHROPIC_API_KEY" is the required env var

**Location:** `README.md:108`, `CLAUDE.md:71`
**Type:** Configuration
**Verdict:** Verified
**Confidence:** High

Reading `app/lib/llm/callLlm.ts:112`, the LLM call resolves the Anthropic key from `process.env.ANTHROPIC_API_KEY`. With no key and no OpenRouter key the call falls through to a mock response (line 203 logs "No API key configured"). Without `ANTHROPIC_API_KEY` (or `OPENROUTER_API_KEY`), no real LLM call is made — so `ANTHROPIC_API_KEY` is the canonical required key for full functionality, matching the table.

**Evidence:** `app/lib/llm/callLlm.ts:112-203`, `app/lib/llm/streamLlm.ts:87-158`

---

## Claim 3: "OPENROUTER_API_KEY ... acts as a fallback LLM provider when ANTHROPIC_API_KEY is unset"

**Location:** `README.md:114`
**Type:** Behavioral / Configuration
**Verdict:** Verified
**Confidence:** High

Both `callLlm` and `streamLlm` consult `ANTHROPIC_API_KEY` first; only when it is unset (and `openRouterModel` is provided by the caller) is OpenRouter invoked. The provider is never used as a non-Anthropic-model router or for selective routing — it is strictly a fallback when the Anthropic key is absent. All API routes that call into the LLM pass an `openRouterModel`, so OpenRouter is genuinely available as a fallback.

The privacy note ("prompts including your source material are sent to OpenRouter when this path is used") is also correct — `userContent` in the OpenRouter request body (`app/lib/llm/callLlm.ts:170-178`) is the unmodified user-supplied content.

**Evidence:** `app/lib/llm/callLlm.ts:112-200`, `app/lib/llm/streamLlm.ts:87-137`, `app/api/formalization/lean/route.ts:104`, `app/api/decomposition/extract/route.ts:116`

---

## Claim 4: "LEAN_VERIFIER_URL ... When unset, Lean code is generated but the type-check step returns the mock-valid response"

**Location:** `README.md:115`, `README.md:88`
**Type:** Behavioral / Configuration
**Verdict:** Verified
**Confidence:** High

`app/api/verification/lean/route.ts:3-4` defaults `LEAN_VERIFIER_URL` to `http://localhost:3100`. On Vercel that address won't resolve, the `fetch` throws, and the `catch` block at line 37-40 returns `{ valid: true, mock: true }`. This is exactly the mock-valid behavior the README describes. The unset case and the unreachable case are observationally identical because the unset default also resolves to an unreachable URL in production.

**Evidence:** `app/api/verification/lean/route.ts:1-41`

---

## Claim 5: "When LEAN_VERIFIER_URL is unset or unreachable, app/api/verification/lean/route.ts falls back to a mock { valid: true, mock: true } response. This is a known silent-pass behavior — useFormalizationPipeline treats it as valid"

**Location:** `CLAUDE.md:76`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

- `app/api/verification/lean/route.ts:39` returns `{ valid: true, mock: true }` on any fetch failure.
- `app/lib/formalization/api.ts:110` consumes that response as `{ valid: Boolean(data.valid), errors: ... }` — the `mock` flag is dropped here.
- `app/hooks/useFormalizationPipeline.ts:121` then sets `verificationStatus = "valid"` whenever `result.valid` is truthy. There is no branch checking for a mock response.
- `app/lib/formalization/leanRetryLoop.ts:73` also returns `valid: true` directly.

So a mock response from the verifier is observationally indistinguishable from a real type-check pass throughout the pipeline.

**Evidence:** `app/api/verification/lean/route.ts:37-40`, `app/lib/formalization/api.ts:110`, `app/hooks/useFormalizationPipeline.ts:121-124`, `app/lib/formalization/leanRetryLoop.ts:73`

---

## Claim 6: "there is currently no 'verifier offline' UI state"

**Location:** `CLAUDE.md:76`
**Type:** Architectural
**Verdict:** Verified
**Confidence:** High

A grep for "verifier is offline", "verifier-offline", and similar strings against `app/**/*.{ts,tsx}` (excluding `.next/`) returns no matches in the source tree. `LeanCodeDisplay.tsx` (the component that renders verification status) takes only `verificationStatus` and `verificationErrors` props — no `mock` flag, no offline indicator. The `.next/` build cache contains a "Lean verifier is offline or not configured" string from a different branch's compiled output, but it does not exist in any source file on this branch.

**Evidence:** `app/components/features/lean-display/LeanCodeDisplay.tsx:1-50`, grep results across `app/**/*.{ts,tsx}`

---

## Claim 7: "The LLM cache and analytics log write to the local filesystem in dev. Vercel Functions can only write to /tmp and that lasts only as long as the warm container"

**Location:** `CLAUDE.md:77`
**Type:** Behavioral / Configuration
**Verdict:** Incorrect
**Confidence:** High

The first half is right but the implication is misleading. The code writes to `process.cwd()/data/...`, **not** `/tmp`:

- `app/lib/analytics/persist.ts:5-6`: `DATA_DIR = join(process.cwd(), "data")`.
- `app/lib/llm/cache.ts:6`: `CACHE_DIR = join(process.cwd(), "data", "cache")`.

On Vercel Functions, `process.cwd()` points at a read-only deployment filesystem. Writes there will throw `EROFS`/`EACCES`, not succeed-then-evaporate. Both call sites wrap the writes in `try { ... } catch { /* non-fatal */ }` (`callLlm.ts:84-91`, `cache.ts setCachedResult`/`removeCachedResult` callers), so the LLM call still returns. The net effect on Vercel is: **analytics and cache writes silently fail** — they don't make it to `/tmp` or anywhere else.

The CLAUDE.md description ("Vercel Functions can only write to /tmp and that lasts only as long as the warm container") is true as a Vercel-platform fact, but it implies the code is using `/tmp`. It isn't. To match actual behavior, the doc should say the writes are attempted against the read-only deployment filesystem, swallowed by try/catch, and never persisted at all on Vercel.

**Evidence:** `app/lib/analytics/persist.ts:1-17`, `app/lib/llm/cache.ts:1-68`, `app/lib/llm/callLlm.ts:75-97`

---

## Claim 8: "Analytics history is written to the local filesystem and does not persist across Vercel function invocations; treat the analytics panel as dev-only"

**Location:** `README.md:120`
**Type:** Behavioral
**Verdict:** Mostly accurate
**Confidence:** High

The conclusion (treat analytics panel as dev-only on Vercel) is correct, but the mechanism is described imprecisely. The code does not persist *because the writes fail outright*, not because they land on ephemeral storage. As with Claim 7, `appendAnalyticsEntry` writes to `process.cwd()/data/analytics.jsonl`, which is read-only on Vercel; the throw is swallowed by the try/catch in `app/lib/llm/callLlm.ts:84-91` (and the equivalent in `streamLlm.ts:55-62`). The analytics log file is therefore never created on Vercel at all.

A precise version: "Analytics writes target a read-only path on Vercel and silently fail; the analytics panel will be empty in production. Treat it as dev-only."

**Evidence:** `app/lib/analytics/persist.ts:1-17`, `app/lib/llm/callLlm.ts:84-91`, `app/lib/llm/streamLlm.ts:55-62`

---

## Claims Requiring Attention

### Incorrect
- **Claim 7** (`CLAUDE.md:77`): The code writes to `process.cwd()/data/...`, not `/tmp`. On Vercel those writes fail and are swallowed by try/catch — the data never lands anywhere. The doc's `/tmp / cold start` framing implies a different mechanism than the one in the code.

### Mostly Accurate
- **Claim 8** (`README.md:120`): Conclusion (treat analytics as dev-only) is right. Mechanism is wrong: writes fail outright on Vercel rather than landing in ephemeral per-invocation storage.
