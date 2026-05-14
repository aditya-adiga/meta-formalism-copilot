# Code Review Rubric — feat/security-deps-guardrails

**Scope:** `origin/main..HEAD` on `feat/security-deps-guardrails` | **Reviewed:** 2026-04-27 | **Status: ✅ PASSES REVIEW**

Commit at review time: `8bde50c` (post-simplifier)

---

## 🔴 Must Fix

| # | Finding | Domain | Location | Status |
|---|---|---|---|---|
| R1 | `react/no-danger` is `"warn"` despite the comment ("fail loudly", "keep it that way [zero usages]") indicating enforcement intent. With `warn`, a future PR introducing `dangerouslySetInnerHTML` exits 0 from `npm run lint` and lands silently. Asymmetric with the other two rules in the same block (both `error`). Convergence: security (Medium) + api-consistency (Inconsistent) → escalated. | Security + API consistency | `eslint.config.mjs:58` | ✅ Resolved — bumped to `"error"` with comment explaining why. |

---

## 🟡 Must Address

| # | Finding | Domain | Source | Status | Author note |
|---|---|---|---|---|---|
| A1 | AST selector `Property[key.name='trust'][value.value=true]` has documented gaps: misses `{ "trust": true }` (string-quoted), `{ trust }` shorthand where `trust` is bound to `true`, and computed keys. Reviewers may over-rely on the rule. Convergence: security (Low) + api-consistency (Informational) + fact-check (Mostly Accurate). | Security + API consistency + fact-check | `eslint.config.mjs:53` | ✅ Resolved — added comment block enumerating known gaps and explicitly framing the rule as best-effort tripwire. |

---

## 🟢 Consider

| # | Finding | Source |
|---|---|---|
| C1 | `--audit-level=high` lets moderate advisories through silently. Threshold tradeoff is reasonable for branch-level CI noise control, but consider adding a non-blocking weekly scheduled audit at `moderate`. | security-reviewer |
| C2 | `npm audit` is serial in the build matrix (runs on both Node 20 and Node 22). Could be a single parallel job to shave PR feedback time. ~10-40s saved per PR. | performance-reviewer |
| C3 | Escape-hatch language drifts between the two `message:` strings ("If you genuinely need it" vs. "Don't enable this; if you must"). Pick one phrasing. | api-consistency-reviewer | (Partially applied — used "If you genuinely need it" in both.) |
| C4 | CI step name "Audit production dependencies" is more verbose than its siblings (`Lint`, `Test`, `Build`). | api-consistency-reviewer | (Applied — renamed to "Audit"; the `--omit=dev` rationale is in the inline comment.) |
| C5 | Both `paths` (exact package match) and `patterns` (glob) are valid for `no-restricted-imports`. The `paths: ["lodash"]` form would not block `lodash/fp`. Worth a one-line note in this file as future restricted-imports rules are added. | api-consistency-reviewer |
| C6 | KaTeX `trust` is left at default (`false`) rather than explicitly set in `LatexRenderer.tsx`. The fact-check claim "KaTeX trust:false" is effectively true but tighter wording would be "KaTeX `trust` left at default (`false`)". Comment-only. | code-fact-check |
| C7 | `postcss <8.5.10` (GHSA-qx2v-qp2m-jg93, moderate, CVSS 6.1) is bundled inside `next@16.2.4` and can't be resolved at the lockfile layer. Below the gate's threshold by design. Consider an `overrides.postcss` block as defense-in-depth or wait for a Next.js patch. | dependency-upgrade-reviewer |

C3 + C4 applied opportunistically. Others are advisory.

---

## ✅ Confirmed Good

| Item | Verdict | Source |
|---|---|---|
| `lodash@4.18.1` is real and legitimate (published 2026-04-01 by jdalton, signed by current active npm key, same maintainer set as 4.17.21). The earlier key's 2025-01-29 expiry explains the rotation, not impersonation. | ✅ Confirmed | code-fact-check + dependency-upgrade |
| `@xmldom/xmldom@0.8.13` is real and legitimate (published 2026-04-18, maintainer karfau, integrity hash matches). | ✅ Confirmed | code-fact-check + dependency-upgrade |
| `lodash` 4.17.23 → 4.18.1 has no breaking surface relevant to `dagre`/`graphlib` consumers (verified via grep — they don't touch `_.unset`/`_.omit`/`_.template`). | ✅ Confirmed | dependency-upgrade |
| `npm audit --omit=dev --audit-level=high` does what the comment claims. | ✅ Confirmed | code-fact-check |
| AST selector evaluates as constant-cost predicate per Property node — microseconds per file, not greedy. | ✅ Confirmed | performance-reviewer |
| `rehype-raw` not currently imported anywhere — the `no-restricted-imports` rule is correctly preventive. | ✅ Confirmed | security-reviewer |
| CI step ordering (cheap → expensive → audit) is sensible. | ✅ Confirmed | api-consistency |
| `--omit=dev` and `--audit-level=high` choices well-justified inline. | ✅ Confirmed | security + api-consistency + dependency-upgrade |
| `npm audit --omit=dev --audit-level=high` exits 0 on this branch — gate passes. | ✅ Confirmed | dependency-upgrade |
| 8 of 9 in-branch claims verified | ✅ Confirmed | code-fact-check |

---

To pass review: all 🔴 items must be resolved. All 🟡 items must be either fixed or carry an author note. 🟢 items are optional.

**Status:** R1 + A1 resolved with code changes. C3 + C4 applied opportunistically. No blockers remain.
