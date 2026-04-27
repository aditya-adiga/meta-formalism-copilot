# API Consistency Review — feat/security-deps-guardrails

**Repository:** meta-formalism-copilot
**Branch:** `feat/security-deps-guardrails`
**Commit:** `8bde50c4bdb571dd83f6d53c779eb343cf1b237d`
**Scope:** `git diff origin/main...HEAD` — `.github/workflows/ci.yml`, `eslint.config.mjs` (lockfile changes are not API surface)
**Reviewed:** 2026-04-27
**Fact-check input:** `docs/reviews/security-deps-guardrails/code-fact-check-report.md` (8 verified, 1 mostly accurate, 0 stale, 0 incorrect)

The "API surface" reviewed here is the **contributor-facing surface**: ESLint rule definitions and the CI workflow. These are the interfaces that future maintainers and CI consumers depend on. No HTTP/SDK surface is touched in this diff.

---

## Baseline Conventions

### `eslint.config.mjs`

The file is short and the diff almost doubles its size, so the "established baseline" inside the file is thin. Pre-existing patterns:

- **Flat-config object style.** Each top-level config object has at most one of `settings`, `rules`, `globalIgnores`. The two pre-existing config objects (the `globalIgnores(...)` block and the `react.version` settings block) each carry a comment explaining *why* they exist (overriding next defaults; working around an ESLint v9 auto-detect crash). The new "Defense-in-depth lint rules" block follows this convention.
- **No prior rule entries.** Before this diff there are no `rules:` entries in the file at all — this is the first one. There is therefore **no in-file precedent for rule severity** (`"error"` vs `"warn"` vs `"off"`), no precedent for restricted-import message style, and no precedent for AST-selector message style. The "consistency baseline" for severity/messaging has to come from outside the file (Next.js conventions, ESLint norms) or be acknowledged as newly-established by this PR.
- **Comment register.** Existing comments are 2-4 sentence prose with concrete reasoning ("…would otherwise cause a crash", "Lean verifier is a separate Node.js project compiled by its own tsconfig"). The new comments match this register.

### `.github/workflows/ci.yml`

Only one job (`ci`) with seven steps after this diff. Step naming pattern observed in the pre-existing steps:

| Step | Name | Form |
|---|---|---|
| 1 | (no `name:`) — `uses: actions/checkout@v6` | n/a (action) |
| 2 | `Use Node.js ${{ matrix.node-version }}` | imperative-ish, dynamic |
| 3 | `Install dependencies` | imperative noun-phrase |
| 4 | `Lint` | bare verb / single-word |
| 5 | `Test` | bare verb / single-word |
| 6 | `Type check` | bare verb-phrase |
| 7 | `Build` | bare verb / single-word |

Pre-existing convention is **terse, imperative, capitalised, no trailing object** for short steps (`Lint`, `Test`, `Build`, `Type check`), and **imperative-with-object** when disambiguation helps (`Install dependencies`, `Use Node.js …`). All steps are inside the single `ci` job — there is no naming pattern for separate jobs to be consistent with. There is also no precedent in this file for inline comments above steps (the new `npm audit` step is the first).

---

## Findings

### 1. `react/no-danger` severity diverges from the other two new rules

**Severity:** Inconsistent
**Location:** `eslint.config.mjs:35,50,58`
**Move:** #1 (baseline conventions), #4 (error consistency), #7 (asymmetry)
**Confidence:** High

The new rule block introduces three lint rules that all serve the same stated goal — guardrails preventing the XSS surface from being weakened (`eslint.config.mjs:29-32`). Two of them are configured at `"error"` (`no-restricted-imports` for `rehype-raw`, `no-restricted-syntax` for `trust: true`); the third (`react/no-danger`) is configured at `"warn"`. The fact-check confirms there are zero current usages of `dangerouslySetInnerHTML` in app code (Claim 9, verified), so an `"error"` severity would not break the existing tree.

The asymmetry has a real consumer impact: a contributor who tries to add `rehype-raw` or `trust: true` will be hard-stopped by CI (`npm run lint` exits non-zero), but a contributor who adds `dangerouslySetInnerHTML` will only see a warning that CI passes through. The comment "Currently zero usages — keep it that way" reads as if the intent is to enforce the invariant, but `"warn"` does not enforce it. Of the three guardrails, `dangerouslySetInnerHTML` is arguably the most direct XSS vector (it is the platform primitive that `rehype-raw` and `trust: true` ultimately funnel into), so weaker severity here is the opposite of what the threat model suggests.

**Recommendation:** Promote `react/no-danger` to `"error"` to match the other two rules, or document explicitly in the comment why this one is intentionally a warning (e.g. "warn-only because legitimate uses may arise; reviewer must approve"). Either is fine; the inconsistency is the issue, not the chosen severity.

---

### 2. AST-selector message duplicates the rehype-raw escape-hatch boilerplate but with subtle wording drift

**Severity:** Minor
**Location:** `eslint.config.mjs:41,54`
**Move:** #2 (naming against the grain), #4 (error consistency)
**Confidence:** Medium

The two `message:` strings in the new rules share the same structural template — explain the risk, then provide an escape hatch — but they word the escape hatch slightly differently:

- `rehype-raw`: "If you genuinely need it, write an ADR and disable this rule explicitly."
- `trust: true`: "Don't enable this; if you must, write an ADR and disable this rule explicitly."

This is small but real: a contributor reading both sees two near-identical rubrics with mildly different cadence ("If you genuinely need it" vs "if you must"), which adds cognitive load and weakens the impression that they're a coordinated set. Both messages also reference "an ADR" without a path; the project's convention (per project-level CLAUDE.md) is `docs/decisions/NNN-title.md` and a `docs/decisions/log.md` for smaller decisions. Spelling that out in the message would shorten the path from "see this lint error" to "do the right thing."

**Recommendation:** Pick one phrasing for the escape hatch and reuse it verbatim, e.g. *"If you genuinely need this, write a decision record under `docs/decisions/` and disable this rule explicitly."* Apply to both messages.

---

### 3. CI step name `Audit production dependencies` is more verbose than its sibling steps

**Severity:** Minor
**Location:** `.github/workflows/ci.yml:45`
**Move:** #2 (naming against the grain)
**Confidence:** High

The five existing imperative steps in the same job are `Lint`, `Test`, `Type check`, `Build`, `Install dependencies`. The new step is `Audit production dependencies` — three words where the closest sibling (`Install dependencies`) is two, and where the bare-verb steps (`Lint`, `Test`, `Build`) are single words. The qualifier "production" is doing work — it tells the reader that dev deps are excluded — but the same information is captured in the inline comment immediately above and in the `--omit=dev` flag on the command itself. A shorter name like `Audit` or `Audit dependencies` would match the existing register.

This is genuinely minor — the step name is a label, not a contract — but the asymmetry is visible at a glance in the GitHub Actions UI sidebar where step names are listed.

**Recommendation:** Rename to `Audit dependencies` to match the `Install dependencies` form, or `Audit` to match `Lint`/`Test`/`Build`. Keep the inline comment as-is — it's the right place for the `--omit=dev` rationale.

---

### 4. `no-restricted-imports` uses package-name match; this is correct but the precedent it sets is worth noting

**Severity:** Informational
**Location:** `eslint.config.mjs:38-44`
**Move:** #1 (baseline conventions), #6 (versioning impact / convention establishment)
**Confidence:** High

The restricted-import rule uses `paths: [{ name: "rehype-raw", … }]`. ESLint's `no-restricted-imports` supports both `paths` (exact package or specifier match) and `patterns` (glob match against import specifiers, useful for restricting whole subtrees like `lodash/*` or `**/internal/*`). The current diff is the **first restricted-imports rule in the codebase**, so this PR establishes the convention.

`paths` is the right choice for `rehype-raw` (the ban is on a specific package, not a path pattern), so the rule itself is fine. The informational note is: future contributors adding more restrictions should be deliberate about whether they're banning a package (use `paths`) or a path pattern (use `patterns`). If a future ban is mis-encoded as a `name:` when it should have been a `pattern:`, it will silently fail to catch deep imports (e.g. `name: "lodash"` does not block `import _ from "lodash/fp"`). Worth a brief note in the comment, or in a docs/decisions entry, so the precedent is set deliberately rather than accidentally.

**Recommendation:** No code change required. Optionally add a one-line comment near the rule clarifying the convention, e.g. `// Use paths: [...] for exact package bans; use patterns: [...] for subtree bans.` This is a low-cost note that pays for itself the next time a guardrail is added.

---

### 5. AST selector matches identifier-key form only, which is acceptable but should be documented as a known gap

**Severity:** Informational
**Location:** `eslint.config.mjs:53`
**Move:** #8 (nullability / coverage contract), #2 (naming against the grain)
**Confidence:** High (per fact-check Claim 7)

The selector `Property[key.name='trust'][value.value=true]` matches `{ trust: true }` but **does not** match `{ "trust": true }` (string-literal key) or `{ trust }` shorthand where the variable holds `true`. The fact-check empirically confirmed this (Claim 7). The current comment ("Broad enough to catch `{ trust: true }` elsewhere too; that's intended") implicitly claims breadth but doesn't disclose the narrowness. A future maintainer who reads the rule and assumes it catches all forms could be surprised.

This matters for guardrail rules specifically because the value of the rule is in being trusted to enforce the invariant; if the invariant has known gaps, callers (humans) need to know. Compare to API design: a method named `validate()` that quietly skips validation for some inputs is worse than one named `validateExceptShorthand()`.

**Recommendation:** Extend the existing comment with one sentence noting the gap, e.g. *"Note: matches `{ trust: true }` only — string-quoted keys (`{ "trust": true }`) and shorthand forms are not caught. Code review covers those."* No code change to the selector itself; documenting the contract is enough.

---

## What Looks Good

- **Comment register and "why" framing.** The new comment block at `eslint.config.mjs:29-32` matches the existing in-file convention of explaining *why* rather than restating *what*. Same for the inline CI comment.
- **Restricted-imports `paths:` choice** is the correct ESLint API for a per-package ban (Finding 4 is informational, not a defect).
- **AST selector is empirically correct** for the form it claims to catch (per fact-check Claim 7) and uses the established esquery selector grammar — no custom DSL invention.
- **CI step ordering** (Lint → Test → Type check → Build → Audit) is sensible: cheap checks first, audit last so a security-only failure doesn't mask a build break.
- **No breaking changes** to any existing surface. All three rules are net-new; the CI step is net-new; the lockfile bumps are within-major and validated against the registry per the fact-check report.
- **Audit threshold defensibility.** `--audit-level=high` and `--omit=dev` are deliberate, documented choices in the inline comment, with the right rationale (avoid every fresh moderate CVE breaking unrelated branches). This is the kind of decision that should be commented inline, and it is.

---

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---|---|---|---|
| 1 | `react/no-danger` is `"warn"` while sibling guardrails are `"error"` | Inconsistent | `eslint.config.mjs:35,50,58` | High |
| 2 | Escape-hatch wording differs between the two rule messages | Minor | `eslint.config.mjs:41,54` | Medium |
| 3 | CI step name `Audit production dependencies` is more verbose than sibling step names | Minor | `.github/workflows/ci.yml:45` | High |
| 4 | This PR establishes the `no-restricted-imports` precedent — note the `paths` vs `patterns` distinction | Informational | `eslint.config.mjs:38-44` | High |
| 5 | AST selector has known coverage gaps (string-keys, shorthand) — worth documenting | Informational | `eslint.config.mjs:53` | High |

---

## Overall Assessment

This is a small, focused diff that adds defense-in-depth guardrails without changing any consumer-facing API. The contributor-facing API surface (ESLint rules and CI steps) is mostly consistent with the surrounding conventions; the issues found are local stylistic asymmetries (Findings 1-3) and forward-looking precedent notes (Findings 4-5), all fixable in place without architectural change. The most substantive finding is the severity asymmetry on `react/no-danger` (Finding 1), which is worth resolving before merge because it weakens the stated invariant ("zero usages — keep it that way") relative to the other two rules.

No breaking changes for any consumer; no asymmetry between request/response shapes (n/a — no HTTP API touched); no pagination/error-format concerns (n/a). The author surveyed the existing file structure and matched the comment register and config-object pattern correctly. Recommend addressing Finding 1 before merge; Findings 2-5 are nice-to-have polish.
