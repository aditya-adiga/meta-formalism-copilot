# Security Review — feat/security-deps-guardrails

**Repository:** meta-formalism-copilot
**Branch:** `feat/security-deps-guardrails`
**Commit:** `8bde50c4bdb571dd83f6d53c779eb343cf1b237d`
**Scope:** `git diff origin/main...HEAD` — `.github/workflows/ci.yml`, `eslint.config.mjs`, `package-lock.json`
**Reviewed:** 2026-04-27
**Fact-check input:** `docs/reviews/security-deps-guardrails/code-fact-check-report.md` (9 claims; 8 verified, 1 mostly accurate)

---

## Trust Boundary Map

This diff does not move user data. It modifies guardrails that act *around* the existing trust boundaries of the app:

- **LLM output → DOM** boundary: LLM-generated markdown is rendered through `react-markdown` in `app/components/features/output-editing/LatexRenderer.tsx`. The pipeline uses `remark-gfm`, `remark-math`, and `rehype-katex`. There is no `rehype-raw` and no `dangerouslySetInnerHTML` anywhere in application code. KaTeX's `trust` option is left at its default (`false`), so links and raw HTML inside math are inert. The new ESLint rules guard this boundary by making it harder for a future contributor to silently weaken any of those three properties.
- **Supply chain → build** boundary: `npm ci` pulls dependencies from the public registry into the build. The new `npm audit --omit=dev --audit-level=high` step adds a CI-time check on production-shipping packages. The two lockfile bumps (`lodash` 4.17.23 → 4.18.1, `@xmldom/xmldom` 0.8.11 → 0.8.13) are transitive (lodash is depended on by other packages with `^4.17.15`; xmldom is a transitive of something pulling `^0.8.6`).

Everything else is configuration. No new code paths, no new surface area for runtime input handling.

---

## Findings

#### `react/no-danger` set to `warn` contradicts the stated "fail loudly" intent

**Severity:** Medium
**Location:** `eslint.config.mjs:58`
**Move:** #5 (Invert the access control model — what does this *prevent*?)
**Confidence:** High

The block-level comment at `eslint.config.mjs:29-32` states these rules "fail loudly if a future change tries to weaken any of those," and the inline comment at line 57 says "Currently zero usages — keep it that way." But `react/no-danger` is configured at severity `"warn"`, not `"error"`. With `warn`, a future PR introducing `dangerouslySetInnerHTML` will produce an ESLint warning but `npm run lint` will still exit 0 — meaning CI will pass and the change can land without anything blocking it. The other two new rules (`no-restricted-imports` for `rehype-raw`, `no-restricted-syntax` for `trust: true`) are correctly set to `"error"`, which makes the inconsistency stand out: a contributor adding `rehype-raw` is blocked, but a contributor adding `dangerouslySetInnerHTML` to render the same untrusted LLM output as live HTML is only warned. Since the LLM-output → DOM trust boundary is exactly what `dangerouslySetInnerHTML` would breach, this is the most security-relevant of the three rules and arguably should be the *strictest*.

**Recommendation:** Change `"react/no-danger": "warn"` to `"react/no-danger": "error"`. If there is a deliberate reason to keep it at `warn` (e.g., wanting visible warnings on a future framework-generated file before deciding to block), document that reason in the comment. Either the rule blocks merges or the comment should not promise that it does.

---

#### `--audit-level=high` lets `moderate` advisories through silently

**Severity:** Low
**Location:** `.github/workflows/ci.yml:46`
**Move:** #10 (Review dependency changes) and #5 (what does this *prevent*?)
**Confidence:** Medium

`npm audit --audit-level=high` only fails CI on `high` or `critical` advisories. The fact-check confirms this is the documented behavior. The trade-off is reasonable — `low` and `moderate` advisories can land en masse for transitive deps and would otherwise turn CI red on unrelated branches — but the chosen threshold has two consequences worth flagging:

1. **No floor on `moderate` advisories.** Many real XSS, prototype-pollution, and ReDoS findings ship as `moderate` in npm's CVSS mapping. With this threshold, a moderate-severity advisory for a production dep can sit in `npm audit` output indefinitely with nothing prompting a fix. The output is still printed, but no human is watching CI logs for green builds.
2. **`high` is already the failure floor; there is no separate "critical" handling.** This is fine — `--audit-level=high` does include critical — but if the team ever wants to differentiate (e.g., critical = page on-call, high = open issue) the current single-step setup doesn't support it. Not a security flaw, just a future-flexibility note.

**Recommendation:** Keep `--audit-level=high` as the CI-failure threshold to avoid false-positive churn, but add a non-blocking informational step that runs `npm audit --omit=dev --audit-level=moderate || true` and uploads the JSON output as an artifact, or wire `npm audit` results into a periodic (e.g., weekly) scheduled workflow that *does* fail on moderate. This gives visibility into moderate findings without blocking unrelated PRs. If that's deemed too much overhead, document in the comment that moderate advisories are intentionally accepted as residual risk.

---

#### [Dependency change] `lodash` 4.17.23 → 4.18.1 minor bump in lockfile-only churn

**Severity:** Informational
**Location:** `package-lock.json:7336-7341`
**Move:** #10 (Review dependency changes)
**Confidence:** High

The fact-check report independently verified that `lodash@4.18.1` is a legitimate publication: same maintainers as 4.17.21 (`jdalton`, `mathias`, `bnjmnt4n`), signed by the current active npm registry key (the previous key expired 2025-01-29, so a key change here is normal rotation, not impersonation), integrity hash matches the registry, and the release timeline 4.17.22 → 4.17.23 → 4.18.0 → 4.18.1 is consistent with a real maintenance push. There is no indication of typosquatting or registry tampering. lodash is a transitive dep here (used by other packages declaring `^4.17.15`), so the resolution shifting forward is the expected behavior of `npm install`. No action required; the bump is safe to land.

**Recommendation:** None. Noted for completeness because the package's long stability at 4.17.21 makes any minor bump look unusual on first glance, but the fact-check resolves the concern.

---

#### [Dependency change] `@xmldom/xmldom` 0.8.11 → 0.8.13 patch bump in lockfile-only churn

**Severity:** Informational
**Location:** `package-lock.json:3857-3866`
**Move:** #10 (Review dependency changes)
**Confidence:** High

Verified by the fact-check report: `@xmldom/xmldom@0.8.13` is a real publication by `karfau`, the longstanding maintainer, and the 0.8.x maintenance line is actively patched in parallel with the newer 0.9.x branch (consistent with the project's documented dual-line release pattern). Integrity hash matches. xmldom is a transitive dep here. The bump is a security-positive direction since the 0.8.x line continues to receive XML-parser hardening patches; staying behind would not have been preferable. No action required.

**Recommendation:** None.

---

#### `no-restricted-syntax` selector for `trust: true` misses two equivalent forms

**Severity:** Low
**Location:** `eslint.config.mjs:53`
**Move:** #5 (Invert the access control model — what does this *prevent*?)
**Confidence:** High

The selector `Property[key.name='trust'][value.value=true]` correctly catches `{ trust: true }` (verified empirically by the fact-check). It does *not* catch:

1. **String-quoted keys**: `{ "trust": true }` — the AST node is `key.type === "Literal"` with `key.value === "trust"`, not `key.name === "trust"`. The selector won't match.
2. **Shorthand-property syntax with a `true` variable**: `const trust = true; rehypeKatex({ trust })` — `value` is an `Identifier`, not a literal `true`, so `value.value` is undefined.
3. **Computed keys**: `{ ["trust"]: true }` — `computed: true`, `key.type === "Literal"`.
4. **`Object.assign({}, { trust: true })` in a parent expression** is fine because the inner object literal still matches, but **factory-call passthrough** like `rehypeKatex(getKatexOptions())` where `getKatexOptions` returns `{ trust: true }` from another module is missed unless the literal in that other module is itself within the lint scope.

The first two are easy for an attacker-developer (or a careless one) to use, intentionally or accidentally, and would defeat the rule. The fact-check noted these as "caveats not claimed" — but the comment at lines 46-49 says "broad enough to catch `{ trust: true }` elsewhere too" without specifying which forms are uncovered, which gives a reader a slightly inflated sense of coverage. This is defense-in-depth, not a primary control, so the impact is bounded — but reviewers who rely on the rule for assurance during code review may not realize the gap.

**Recommendation:** Either (a) tighten the selector to also match `Property[key.value='trust'][value.value=true]` (string-literal keys) and `Property[key.name='trust'][value.type='Identifier']` (shorthand with any identifier value, including `true`-named consts) — accepting that the second form will produce occasional false positives — or (b) add a sentence to the comment listing the uncovered forms so future maintainers know the rule is not airtight. Option (b) is lower-effort and probably sufficient given that the primary protection is `trust` defaulting to `false` upstream in KaTeX.

---

#### `no-restricted-imports` for `rehype-raw` is preventive only — no current import exists

**Severity:** Informational
**Location:** `eslint.config.mjs:32-44`
**Move:** #10 (Review dependency changes) and #2 (Find the implicit sanitization assumption)
**Confidence:** High

The fact-check confirmed `rehype-raw` is not in `package.json`, not in `package-lock.json`, and not imported anywhere in `app/` or `lib/`. The rule is therefore preventive — it does not contradict any existing usage. This is the correct shape for a guardrail rule, and there is nothing to fix. Worth noting explicitly because the "no-restricted-imports" pattern is sometimes applied retroactively to deprecate an existing dependency, which would have caused immediate lint failures. Here, that's not the case: the rule activates the moment someone tries to add `rehype-raw`, which is exactly when the security argument matters.

**Recommendation:** None. Consider adding `"rehype-raw/lib"` and any other deep-import paths if the team wants to be thorough, since `no-restricted-imports` with a bare `name` does not block deep imports like `import "rehype-raw/lib/raw"`. Low priority — `rehype-raw` doesn't have a public deep-import surface that would commonly be used.

---

## What Looks Good

- **Both `error`-severity rules block the most exploitable vectors**: `no-restricted-imports` against `rehype-raw` and `no-restricted-syntax` against `trust: true` are correctly set to fail CI. These cover the two paths a future change would most plausibly take to enable raw HTML rendering of LLM output.
- **`--omit=dev` framing is correct**: production-only audit is the right scope for a CI gate that runs on every PR. Dev-only advisories matter for contributor laptops, not for the shipped artifact, and conflating the two would produce noise that erodes the gate's credibility.
- **Comment quality is high**: each rule has a justification explaining the threat model and the escape hatch ("write an ADR and disable this rule explicitly"). This is the right register for guardrails that a future contributor with legitimate need will encounter.
- **Lockfile bumps are clean**: both transitive bumps are signed by the legitimate maintainers, integrity hashes match the registry, and neither appears to be a coerced or accidental change. The fact-check independently confirmed the lodash key rotation, which was the most plausible source of suspicion.
- **No production code touched**: this is a configuration-only diff. Trust boundaries in the app are unchanged, so the review surface is small and contained.

---

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 1 | `react/no-danger` is `warn` despite "fail loudly" intent | Medium | `eslint.config.mjs:58` | High |
| 2 | `--audit-level=high` allows moderate advisories silently | Low | `.github/workflows/ci.yml:46` | Medium |
| 3 | [Dependency change] `lodash` 4.17.23 → 4.18.1 verified clean | Informational | `package-lock.json:7336-7341` | High |
| 4 | [Dependency change] `@xmldom/xmldom` 0.8.11 → 0.8.13 verified clean | Informational | `package-lock.json:3857-3866` | High |
| 5 | `trust: true` selector misses string-keyed and shorthand forms | Low | `eslint.config.mjs:53` | High |
| 6 | `no-restricted-imports` rule is preventive only — no current import | Informational | `eslint.config.mjs:32-44` | High |

---

## Overall Assessment

This is a low-risk, configuration-only change that strengthens defense-in-depth around the LLM-output-to-DOM boundary and adds a CI-time gate against high-severity supply chain advisories. The dependency bumps are independently verified clean by the fact-check report. The single most important issue to address before merge is **Finding #1**: `react/no-danger` is set to `"warn"`, which contradicts the comment's stated intent to "fail loudly" and creates an asymmetry where the most direct path to the XSS sink the diff is trying to close (`dangerouslySetInnerHTML` on LLM output) is the *least*-protected of the three new rules. Bumping it to `"error"` is a one-character change with no downside (zero current usages, confirmed). Findings #2 and #5 are quality-of-coverage notes that can be addressed in follow-up; Findings #3, #4, and #6 are informational and require no action. The diff is safe to land once Finding #1 is resolved.
