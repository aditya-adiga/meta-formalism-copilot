# Code Review Rubric — feat/lean-verifier-graceful-degradation

**Scope:** `origin/main..HEAD` on `feat/lean-verifier-graceful-degradation` | **Reviewed:** 2026-04-27 | **Status: ✅ PASSES REVIEW**

Commit at review time: `c95c9cb` (post-simplifier)

---

## 🔴 Must Fix

| # | Finding | Domain | Location | Status |
|---|---|---|---|---|
| R1 | Stale docs describe removed `{ valid: true, mock: true }` fallback / removed localhost default. Convergence: fact-check (Stale) + api-consistency (Inconsistent) → escalated. | Fact-check + API consistency | `README.md:84,92`, `docs/ARCHITECTURE.md:200-205` | ✅ Resolved (commit pending) |
| R2 | `verifier-error` path discards upstream response body — useful diagnostic text for operators is lost. Convergence: performance (Informational) + api-consistency (Inconsistent High) → escalated. | Performance + API consistency | `app/api/verification/lean/route.ts:48` | ✅ Resolved (commit pending) — upstream body now forwarded in `detail` (truncated to 500 chars) |

---

## 🟡 Must Address

| # | Finding | Domain | Source | Status | Author note |
|---|---|---|---|---|---|
| A1 | `verifyLean()` client helper drops the typed `reason`/`detail` fields the server populates, so the UI banner cannot differentiate "env var missing" (won't ever recover without a redeploy) from "host dead" (transient — Re-verify might succeed). | API consistency | api-consistency-reviewer | 🟡 Deferred | Surfacing `reason` to UI is a feature surface decision (e.g. "should Re-verify be hidden when reason === 'verifier-not-configured'?"), not a regression from this branch. The simplifier pass intentionally removed the unused `unavailableReason` field for this same reason. Tracked for follow-up; current branch is shippable. |

---

## 🟢 Consider

| # | Finding | Source |
|---|---|---|
| C1 | `text-amber-700` borderline AA contrast on amber `unavailable` badge; bump to `amber-800` + `font-medium` so it's at least as prominent as "Verified". | ui-visual-review |
| C2 | Color-only badge family (Verified/offline/Failed) — add a glyph for colorblind users / touch devices where `title` tooltip is invisible. | ui-visual-review |
| C3 | Banner body uses `text-amber-900` while heading uses `text-amber-800` — inverts the heading-darker convention used elsewhere. | ui-visual-review |
| C4 | Inline `<code>LEAN_VERIFIER_URL</code>` lacks background; reads as prose. | ui-visual-review |
| C5 | Re-verify "↺" affordance identical for edited-code vs. verifier-offline — could mislead. | ui-visual-review |
| C6 | `LEAN_VERIFIER_URL` concatenated unchecked into fetch URL. Operator-trusted (not user-controlled), so not classic SSRF, but a misconfigured deploy could POST to internal/metadata endpoints. Optional startup validation. | security-reviewer |
| C7 | Verifier 2xx body forwarded unfiltered to client. Client coerces fields explicitly so type-confusion is bounded. Optional server-side response shaping. | security-reviewer |
| C8 | No request body size or rate limit on the route. Pre-existing pattern across all routes. | security-reviewer |
| C9 | `setTimeout` handle not cleared on the fetch-throw path. Pre-existing on main; bounded ≤35s. | performance-reviewer |
| C10 | Re-verify button is offered on `unavailable` even when `reason === 'verifier-not-configured'`, where the round-trip is guaranteed to fail until redeploy. (Same root cause as A1.) | performance-reviewer |
| C11 | `VerifyLeanResult.unavailable` JSDoc says "not configured or unreachable" but the field is also set on the verifier-error path. | api-consistency-reviewer |

C1 resolved (commit pending). C2-C11 are advisory.

---

## ✅ Confirmed Good

| Item | Verdict | Source |
|---|---|---|
| Mock-pass removal closes a real silent-failure mode where verifier outage rendered as "Verified" | ✅ Confirmed | security-reviewer |
| `unavailable` precedence over `valid` is correctly ordered everywhere (route, helper, hook, badge) | ✅ Confirmed | security-reviewer + api-consistency |
| Catch block leaks no internal error details to client | ✅ Confirmed | security-reviewer |
| AbortController + 35s timeout correctly placed | ✅ Confirmed | security-reviewer + performance |
| `sanitizeVerificationStatus` maps `unavailable` to `none` so stale verifier-state doesn't survive page reloads | ✅ Confirmed | security-reviewer |
| `leanRetryLoop` short-circuit on `unavailable` saves up to 2 redundant LLM Lean-generation calls per node — real cost/latency win at batch scale | ✅ Confirmed | performance-reviewer |
| Three-failure-mode taxonomy (`verifier-not-configured`/`unreachable`/`error`) is coherent and propagates correctly through route → client → retry loop → persistence sanitizer → three UI surfaces | ✅ Confirmed | api-consistency |
| New `"unavailable"` `VerificationStatus` value matches existing enum-literal style | ✅ Confirmed | api-consistency |
| Re-verify button placed outside scroll container, action remains visible in error state, banner uses normal block flow | ✅ Confirmed | ui-visual-review |
| 12 of 15 in-branch claims (comments, JSDoc, commit messages, tests) verified accurate | ✅ Confirmed | code-fact-check |

---

To pass review: all 🔴 items must be resolved. All 🟡 items must be either fixed or carry an author note. 🟢 items are optional.

**Status note:** R1 + R2 fixed in working tree (about to commit). A1 carries author note deferring to follow-up. C1 fixed opportunistically (cheap polish). All other 🟢 items remain advisory. No blocking findings remain.
