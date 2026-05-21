# Code Review Rubric

**Commit:** 0a96cce (findings); fixes applied in a follow-up commit
**Scope:** `feat/evidence-scoring` vs `main` — 14 files, +853/-42 | **Reviewed:** 2026-05-21 | **Status: ✅ PASSES REVIEW** — all 4 amber items fixed (re-review recommended to confirm)

---

## 🔴 Must Fix

Issues that must be resolved before merge.

| # | Finding | Domain | Location | Legibility-target | Considered overrides | Status |
|---|---|---|---|---|---|---|
| — | No red items | — | — | — | — | — |

---

## 🟡 Must Address

Each must be fixed or carry an author note justifying why it stands.

| # | Finding | Domain | Source | Legibility-target | Considered overrides | Status | Author note |
|---|---|---|---|---|---|---|---|
| A1 | Mock fallback returns `mock: true` via inline `satisfies`, not on the typed `EvidenceScoreResponse`. Consumers (`useEvidenceScoring`) can't observe it, so neutral 0.5 placeholder scores are silently marked `scored` — a silent-pass echoing the Lean-verifier pattern. **Escalated 🟢→🟡 via convergence.** | API Consistency + Architecture | API consistency (Minor/High) + Architecture (Minor #4) | for-author | — | ✅ Fixed | `mock?` added to `EvidenceScoreResponse`; `useEvidenceScoring` now surfaces a "Scoring unavailable" error and skips `applyScores` on mock, so placeholders are never persisted as real scores |
| A2 | Search and scoring share one `errors[key]` store slot. Loading state was correctly split into a dedicated `scoring` map but the error channel was not; `score()` and `search()` clear each other's errors and scoring errors render through the search hook's slot unlabeled. | Architecture (Coupling) | Architecture (high conf), agreed by tech-debt | for-author | — | ✅ Fixed | Added a dedicated `scoringErrors` map + `setScoringError`; `useEvidenceScoring` uses it and `FindEvidenceButton` renders it separately |
| A3 | `slot.scored` duplicates the derivable per-paper `reliability !== null`; both are persisted to localStorage and can drift out of sync. | Architecture (Coupling) | Architecture (medium conf) | for-author | — | ✅ Fixed | Removed the stored `scored` field; added derived `isSlotScored(slot)` helper used by all readers (store, hook, results section) |
| A4 | `callLlm.ts` comment says "Confirmed unsupported: numeric-range keywords" but the strip-set adds 3 pre-emptive keywords (`exclusiveMinimum`/`exclusiveMaximum`/`multipleOf`) that are not confirmed-rejected, and the quoted Anthropic error text is unverifiable from the repo. Comment is honest ("Extend this set…") but slightly imprecise. Low-effort: tighten wording or acknowledge. | Fact-check (Mostly Accurate) | Fact-check Claim 1 | for-author | — | ✅ Fixed | Reworded: "Observed-rejected" scoped to `minimum`/`maximum`; the rest labeled stripped pre-emptively; error text marked paraphrased |

---

## 🟢 Consider

Advisory — not required to pass review.

| # | Finding | Source | Legibility-target | Considered overrides |
|---|---|---|---|---|
| C1 | ✅ **Fixed** — wrapped `JSON.parse(stripCodeFences(text))` in try/catch; a parse failure now returns **502** like the non-array branch. *(Security Low + Test-strategy G16 agreed.)* | Security + Test-strategy | for-author | — |
| C2 | `responseFormat`/schema omitted from the `callLlm` cache key (`callLlm.ts:120-121`). Benign now (each endpoint's prompt is unique) but a latent cross-endpoint cache-collision footgun. *(Performance Low + Tech-debt #1 agree.)* | Performance + Tech-debt | for-author | — |
| C3 | Request field `claimContent` diverges from the sibling `evidence-search` route's `elementContent` for the same logical input. | API consistency (Minor) | for-author | — |
| C4 | `applyScores` is the only store action using an `apply*` verb vs the established `set*`/`clear*` shape (borderline — it has merge semantics). | API consistency (Minor) | for-author | — |
| C5 | `adaptSchemaForAnthropic` exported from `callLlm.ts` with a single in-module caller (widens public surface); the `[0,1]` schema constraint is degraded to a comment-linked runtime clamp in a different module. | API consistency (Info) + Architecture (Minor #3) | for-author | — |
| C6 | Request DTO `Pick`s from the storage model, welding the wire contract to the persistence model. | Architecture (Minor #5) | for-author | — |
| C7 | ✅ **Fixed** — score button bumped from `text-[10px]`/`px-1.5 py-0.5` to `text-xs`/`px-2 py-1` for a larger target. | UI visual | for-author | — |
| C8 | Red-flag list has no `max-h`/`overflow` cap on LLM-generated content (`EvidencePaperCard.tsx:79-86`). | UI visual | for-author | — |
| C9 | Score badge rationale delivered only via native `title` (`EvidenceScoreBadge.tsx:27`) — pointer-only, not touch/keyboard accessible. | UI visual | for-author | — |
| C10 | `sortByScore` sums a `-1` sentinel for unscored dimensions — latent ordering ambiguity, currently masked by the all-or-nothing scoring invariant. | UI visual | for-author | — |
| C11 | `OpenRouterError` path forwards the raw upstream error body (`err.details`) to the client. Pre-existing convention (sibling `evidence-search/route.ts:188`), not a regression. | Security (Low) | for-author | — |
| C12 | `title`/`journal`/`authors` input field sizes unbounded (cost-amplification shape; single-tenant, so only the operator pays). | Security (Info) | for-author | — |
| C13 | Test gaps (23 enumerated, G1–G23). Highest value: (1) `adaptSchemaForAnthropic` pure unit test, (2) `evidenceStore.applyScores` invariant tests, (3) first `/api/evidence-score` route-handler test (establishes the repo's first API-route harness). | Test strategy | for-author | — |

---

## ↩️ Considered Overrides

No prior overrides matched this diff. *(Override log created this run; no rows yet.)*

| Override (PR ref / Date) | Prior finding | Original → Override | Reason | This run's treatment |
|---|---|---|---|---|
| — | — | — | — | — |

---

## ✅ Confirmed Good

| Item | Verdict | Source | Legibility-target |
|---|---|---|---|
| LLM output treated as untrusted — `clampScore` + `normalizeStudyType` + `validatePaperScore` make the structured-output schema advisory, not load-bearing | ✅ Confirmed | Security, Fact-check | for-orchestrator-synthesis |
| New `evidence-score` slice faithfully mirrors the `evidence-search` slice (route + testable helper + hook + store actions); reuses `callLlm`/`stripCodeFences`/`fetchApi`; clean dependency direction, no cycles | ✅ Confirmed | Architecture, API consistency | for-orchestrator-synthesis |
| `adaptSchemaForAnthropic` placed at the correct provider-dispatch seam; non-mutating + recursive as documented | ✅ Confirmed | Architecture, Fact-check | for-orchestrator-synthesis |
| `scoreValidation.ts` extracted specifically for unit-testing; well covered by `scoreValidation.test.ts` | ✅ Confirmed | Test-strategy, Tech-debt | for-orchestrator-synthesis |
| Title-row `min-w-0` + `shrink-0` + `break-words` flex handling is correct; focus-visible rings on every touched control; score button has full default/hover/focus/active/disabled coverage + persistent label-updating affordance | ✅ Confirmed | UI visual | for-orchestrator-synthesis |
| Scoring path is a single batched LLM call — no N+1; double-submit guard present; `sortByScore` memoized over hard-capped N≤8 | ✅ Confirmed | Performance | for-orchestrator-synthesis |

---

## ⏭️ Skipped Core Critics

All core critics ran; no skips applied.

---

To pass review: all 🔴 items resolved (none here). All 🟡 items fixed or carrying an author note. 🟢 items optional.
