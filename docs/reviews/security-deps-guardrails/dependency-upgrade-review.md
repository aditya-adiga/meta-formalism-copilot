# Dependency Upgrade Review — `feat/security-deps-guardrails`

Commit: 8bde50c4bdb571dd83f6d53c779eb343cf1b237d
Branch: `feat/security-deps-guardrails`
Base: `origin/main`
Date: 2026-04-27

## Scope

This branch makes two transitive dependency bumps in `package-lock.json`:

| Package | Before | After | Direct parent(s) | Why it ships |
|---|---|---|---|---|
| `@xmldom/xmldom` | 0.8.11 | 0.8.13 | `mammoth@1.12.0` | `.docx` parsing in `app/lib/utils/fileExtraction.ts` |
| `lodash` | 4.17.23 | 4.18.1 | `dagre@0.8.5`, `graphlib@2.1.8` (transitively under dagre) | Graph layout in `causal-graph/useCausalGraphLayout.ts`, `proof-graph/useGraphLayout.ts` |

It also adds a CI gate (`npm audit --omit=dev --audit-level=high`) and two ESLint guardrails (`no-restricted-imports` for `rehype-raw`, `no-restricted-syntax` for `trust: true`, `react/no-danger: warn`).

The four prompt questions from the task are answered below.

---

## Q1 — Why these two only? Are there other prod transitive deps with known CVEs?

**Answer:** These are the only two prod transitives with known advisories at the time of this review **at the high+ severity level the new CI gate enforces**. There is one residual *moderate* finding that the bumps did not address (see Q3).

Verification:

```
$ npm audit --omit=dev --audit-level=high
# (no output — exit 0, no high/critical advisories)
```

Full prod audit (`npm audit --omit=dev --json`) reports 2 moderate, 0 high, 0 critical. Both moderates trace to the same root: `postcss <8.5.10` (GHSA-qx2v-qp2m-jg93, "XSS via Unescaped `</style>` in CSS Stringify Output", CVSS 6.1). It is pulled in only via `next@16.2.4`'s pinned nested copy at `node_modules/next/node_modules/postcss`, and `npm audit fix` would have to downgrade `next` to `9.3.3` (the only "fix available" path npm finds). That is not a real fix — it is an unrelated downgrade of the framework.

So: no other high/critical prod transitives were left on the table. The two bumps cover the entire high+ surface visible to npm. The moderate `postcss` advisory is real but cannot be resolved at this layer; resolving it requires either a `next` patch release that bumps its nested postcss, or a manual override (e.g. `overrides.postcss` in `package.json`). That is out of scope for this branch and should be tracked as follow-up.

## Q2 — `lodash` 4.17.23 → 4.18.1: any breaking changes that consumers (`dagre`/`graphlib`) might depend on?

**Answer:** No. The 4.18.x line is functionally a security patch series, not a feature minor. None of the affected APIs are used by `dagre` or `graphlib`.

Changelog summary (lodash GitHub releases):

- **4.18.0 (2026-03-31)** — security only:
  - `_.unset` / `_.omit`: prototype-pollution hardening — `constructor`/`prototype` are now blocked as non-terminal path keys regardless of input wrapping.
  - `_.template`: code-injection hardening — `imports` keys are validated against forbidden identifier characters; invalid keys now throw.
  - No public API removed or renamed.
- **4.18.1 (2026-04-01)** — patch fixing a build-mapping `ReferenceError` introduced by 4.18.0's modular rebuild. No behavior change.

The behavioral changes in 4.18.0 only matter for callers that pass attacker-controlled paths to `_.unset`/`_.omit`, or attacker-controlled `imports` keys to `_.template`. Consumer check on the resolved tree:

```
$ grep -rE "_\.(unset|omit|template)\b|lodash/(unset|omit|template)" \
    node_modules/dagre/lib node_modules/graphlib/lib
# (no matches)
```

`dagre`/`graphlib` use the standard collection/utility surface of lodash (`forEach`, `map`, `filter`, etc.) — none of which changed. The bump is safe for these consumers.

The semver designation `4.17.23 → 4.18.1` is a minor bump in name, but in practice it is a security-patch release with no API surface changes.

## Q3 — Does `npm audit --omit=dev --audit-level=high` show unfixed advisories on this branch?

**Answer:** No. Output:

```
$ npm audit --omit=dev --audit-level=high
# exit 0, no advisories printed at high+ level
```

The CI gate as written passes cleanly on this branch. The full prod audit (without the level filter) still reports the 2 moderate `postcss`-via-`next` findings discussed in Q1; those are deliberately below the gate's threshold, consistent with the comment in `ci.yml` ("Lower levels are informational and would otherwise make every fresh CVE break CI on branches that have nothing to do with security").

Recommended follow-up (separate branch): track the postcss-via-next moderate. Options:

1. Wait for a `next` patch that bumps its bundled postcss past 8.5.10 (preferred — zero project risk).
2. Add `overrides.postcss` in `package.json` to force the nested copy. Carries low risk because postcss is API-stable across 8.4.x → 8.5.x, but should be validated with a build + visual smoke test.

Neither is required to land this branch.

## Q4 — Are `package.json` bumps matched, or only `package-lock.json`?

**Answer:** `package.json` was not modified, and that is correct here. Both bumped packages are pure transitives — they do not appear in `package.json` `dependencies` or `devDependencies`. There is no top-level entry to bump.

`package-lock.json` is the only place these versions are pinned, and it pins them exactly (e.g. `"version": "4.18.1"` with integrity hash). A future `npm install` reads the lockfile first and will reproduce 4.18.1 / 0.8.13. Regression would only occur if someone ran `npm install <something>` that forced lockfile resolution to recompute these subtrees and an older satisfying version were chosen — but the parent constraints (`mammoth@1.12.0` requires `@xmldom/xmldom@^0.8.5`; `dagre@0.8.5` and `graphlib@2.1.8` require `lodash@^4.17.4` / `^4.17.5`) all still accept the new versions, and npm's resolver prefers the highest-satisfying version, so a regression is extremely unlikely.

Mild hardening option (not required): add an `overrides` block in `package.json` to lock these floors explicitly:

```json
"overrides": {
  "@xmldom/xmldom": "^0.8.13",
  "lodash": "^4.18.1"
}
```

This would make the security floor visible at the top level and survive any future lockfile regeneration. Not required for this PR — the lockfile pins are sufficient — but worth considering as a defense-in-depth follow-up alongside the postcss override discussion.

---

## Per-skill structured evaluations

### `@xmldom/xmldom` 0.8.11 → 0.8.13

**Recommendation:** Upgrade now (already done on this branch).
**Breaking change impact:** None for this project's usage.
**Estimated effort:** 0 (transitive; lockfile-only).
**Risk:** Low.

**Motivation:** Security. 0.8.13 closes three GHSA advisories (GHSA-j759-j44w-7fr8, GHSA-x6wf-f3px-wcqx, GHSA-f6ww-3ggp-fr8h) about XML-injection-prone serialization of Comment, ProcessingInstruction, and DocumentType nodes. 0.8.12 separately added `]]>` validation in `createCDATASection` and CDATA splitting on serialization.

**Breaking changes that affect this project:** None. The new `requireWellFormed` option in `XMLSerializer.serializeToString()` is opt-in (4th arg). The `]]>` rejection in `createCDATASection` is a stricter throw, but mammoth's `extractRawText` flow does not construct CDATA from arbitrary user data — it parses inbound `.docx` XML, which is well-formed by construction.

**Breaking changes that don't affect this project:** Stricter CDATA validation; iterative-vs-recursive DOM traversal (perf-positive on deep trees, no API change).

**Transitive effects:** None. Same `^0.8.x` parent constraint from mammoth.

**Risk factors:** Low. Mammoth is the only consumer; it uses the parser, not the serializer's new strict mode.

### `lodash` 4.17.23 → 4.18.1

**Recommendation:** Upgrade now (already done on this branch).
**Breaking change impact:** None for this project's usage.
**Estimated effort:** 0 (transitive; lockfile-only).
**Risk:** Low.

**Motivation:** Security hardening of `_.unset`/`_.omit` (prototype pollution) and `_.template` (code injection in `imports`).

**Breaking changes that affect this project:** None. The project does not import lodash directly. The only consumers are `dagre` and `graphlib`, which use lodash's collection/utility surface (`forEach`, `map`, etc.), not `unset`/`omit`/`template`.

**Breaking changes that don't affect this project:** The `_.template` `imports`-key validation now throws on identifiers containing forbidden characters; nothing in the project or its tree calls `_.template`.

**Transitive effects:** None.

**Risk factors:** Low. The minor-version bump is cosmetic — by content, this is a patch series.

---

## Overall recommendation

**Land this branch as-is.** The bumps are minimal-surface security upgrades with no consumer risk; the CI gate matches what the bumps fix; `package.json` correctly remains untouched because both packages are transitives.

Suggested follow-ups (do not block this PR):

1. Track the postcss-via-next moderate advisory; revisit when `next` ships a patch that bumps its bundled postcss past 8.5.10, or add a top-level `overrides.postcss` after a build + visual smoke test.
2. Consider adding `overrides` for `@xmldom/xmldom` and `lodash` to make the security floor visible and lockfile-regeneration-proof. Not required.
