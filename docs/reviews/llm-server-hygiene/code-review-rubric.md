# Code Review Rubric — feat/llm-server-hygiene

**Scope:** `origin/main..HEAD` on `feat/llm-server-hygiene` | **Reviewed:** 2026-04-27 | **Status: ✅ PASSES REVIEW**

Commit at review time: `f2f149b` (post-simplifier)

---

## 🔴 Must Fix

| # | Finding | Domain | Location | Status |
|---|---|---|---|---|
| R1 | Stale SSE protocol JSDoc — documents `event: error — { error, details }` but the emit site sends only `{ error }`. Triple-flagged: fact-check (Stale) + security (Low) + api-consistency (Informational) → escalated. Risk is a future contributor re-adding `details` to the wire because the contract comment says it's part of the protocol. | Fact-check + security + api-consistency | `app/lib/llm/streamLlm.ts:68-71` | ✅ Resolved — JSDoc rewritten with explicit note that details is not forwarded over SSE. |

---

## 🟡 Must Address

| # | Finding | Domain | Source | Status | Author note |
|---|---|---|---|---|---|
| A1 | Invalid-JSON logging asymmetry: `edit/artifact/route.ts` was tightened to log length only, but the shared `artifactRoute.ts:107` (used by ~7 formalization routes) still logs a 500-char preview. The hygiene rationale applies more strongly to those routes since they ingest user source material directly. | API consistency (Inconsistent) | api-consistency-reviewer | ✅ Resolved — `artifactRoute.ts` now logs length only, mirroring edit/artifact. Response payload (`details: preview`) intentionally preserved so callers can debug their input. |

---

## 🟢 Consider

| # | Finding | Source |
|---|---|---|
| C1 | `errorWithDetails` is now a write-only channel — no in-tree consumer reads `.details` from thrown Errors. Could replace with `OpenRouterError` for type-symmetry with the synchronous side. | api-consistency-reviewer |
| C2 | 6 sibling routes still echo `OpenRouterError.details` verbatim in HTTP 502 responses. Out of scope for this branch, but worth a follow-up policy comment: does "don't log it" imply "don't return it"? | security-reviewer |
| C3 | `OpenRouterError.responseFormat` JSDoc says "Only used with the OpenRouter provider" but the Anthropic branch also forwards it as `output_config`. Pre-existing on main; not introduced by this branch. | code-fact-check |
| C4 | Test mutates `process.env` without restoration. Vitest stability nit; use `vi.stubEnv`. | security-reviewer |
| C5 | `simulateStreamFromCache` is O(length) wall-clock at 20 chars / 15 ms; large cached payloads drain slowly. Dev-env-gated, no production impact. | performance-reviewer |
| C6 | `getAnthropicClient → makeAnthropicClient` is a public-surface rename. Clean within tree; worth noting in PR description. | api-consistency-reviewer |
| C7 | Commit message claim "Lint clean" was technically inaccurate (2 pre-existing warnings in `app/page.tsx`). Cosmetic; no code action. | code-fact-check |

---

## ✅ Confirmed Good

| Item | Verdict | Source |
|---|---|---|
| Per-call client construction has zero performance cost (Anthropic SDK ctor does no I/O; undici keeps connection-pool process-global) | ✅ Confirmed | performance-reviewer |
| No residual module-scope credential caching anywhere | ✅ Confirmed | security-reviewer |
| Error-logging path leaks no API key, request body, or PII (status codes + endpoints + response lengths only) | ✅ Confirmed | security-reviewer |
| SSE error event no longer carries `details` on the wire | ✅ Confirmed | security-reviewer |
| `OpenRouterError` shape and `{ error, details }` 502 envelope unchanged across 6 route handlers | ✅ Confirmed | api-consistency |
| `callLlm.test.ts` correctly pins per-call ctor invariant — future singleton regression would be caught | ✅ Confirmed | security-reviewer + api-consistency |
| Per-call client symmetric between callLlm and streamLlm.streamAnthropic | ✅ Confirmed | api-consistency |
| 11 of 14 in-branch claims fully verified | ✅ Confirmed | code-fact-check |

---

To pass review: all 🔴 items must be resolved. All 🟡 items must be either fixed or carry an author note. 🟢 items are optional.

**Status:** R1 + A1 resolved with code changes. All 🟢 items advisory. No blockers remain.
