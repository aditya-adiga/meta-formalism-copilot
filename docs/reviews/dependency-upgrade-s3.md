# Dependency Add Evaluation: `isomorphic-git@^1.38.3` + `buffer@^6.0.3` (DD-009 S3)

> The skill's "upgrade" framing is adapted here to a **new dependency add**. There is no
> current→target transition; the question is "any blocking supply-chain / maintenance reason
> not to land these new runtime deps." Functionality and performance were already validated by
> two spikes (`docs/spikes/isomorphic-git-perf-50mb.md`, `docs/spikes/iso-git-browser-smoke.md`),
> and the choice was made in DD-009 (`docs/decisions/009-artifact-corpus-architecture.md`). This
> review focuses exclusively on the supply-chain / maintenance dimension.

### Summary
**Recommendation:** **GO — add now.** No blocking supply-chain or maintenance reason to defer.
**Breaking change impact:** N/A (new add, not an upgrade).
**Estimated effort:** Already done — deps are installed; this is the gate before the PR opens.
**Risk:** **Low**, with one acknowledged, already-tracked ongoing tax (single primary maintainer — see Risk Factors). DD-009 already priced this in and defined concrete revisit triggers.

### Motivation
DD-009 S3 introduces a corpus-versioning pipeline that uses git primitives (commit/log/push/pull)
in a Web Worker over an OPFS-backed filesystem. `isomorphic-git` is the pure-JS git implementation
that powers this; `buffer` is the Buffer polyfill its browser build requires. Both are new **runtime**
(non-dev) dependencies on the `feat/corpus-git-pipeline` branch.

### What Was Added (diff: `feat/corpus-architecture..feat/corpus-git-pipeline`)

Direct deps added to `package.json`:
- `isomorphic-git@^1.38.3`
- `buffer@^6.0.3`

Installed-tree confirmation (`npm ls isomorphic-git buffer`):
```
├── buffer@6.0.3
└─┬ isomorphic-git@1.38.3
  └─┬ readable-stream@4.7.0
    └── buffer@6.0.3 deduped
```
`buffer` is both a direct dep and a transitive dep of iso-git (deduped to one copy).

### Maintenance Posture

| Signal | Finding | Assessment |
|--------|---------|------------|
| Latest published version | `1.38.3`, published **2026-05-26** (~1 week before this review) | Active |
| Our pin | `^1.38.3` = the actual current latest | Current, not stale |
| Recent cadence | 8 releases 2026-04-27 → 2026-05-26 (1.37.6 → 1.38.3) | Very active; semantic-release on every PR merge |
| Age / track record | Created 2017-09; 9 years of continuous releases | Mature, battle-tested |
| Maintainers (npm registry) | 3 listed: `wmhilton`, `mojavelinux`, `jcubic` | Not strictly single-maintainer at the publish level, though `wmhilton` is the historical primary author |
| `buffer` (feross) | `6.0.3`, ubiquitous polyfill, MIT, very widely depended-on | Effectively zero abandonment risk |

**On DD-009's single-maintainer concern (Consequence line 116, Revisit trigger line 123):** The
revisit trigger fires if iso-git "stalls or is abandoned upstream — last release >18 months, or
critical CVE without patch within 60 days." Neither condition is remotely near: the last release
was ~1 week ago, and there is no open critical CVE (see below). The npm registry actually lists
three publishers, which is slightly better than the "single-maintainer" framing in DD-009. The
ongoing maintenance tax DD-009 named is real but does not block landing; it is correctly handled
as a tracked revisit trigger, not a pre-merge blocker.

### Known Advisories / CVEs

- **`npm audit`:** 2 moderate advisories in the full tree — both in `next` / `postcss`
  (PostCSS XSS via unescaped `</style>`). **Pre-existing and unrelated** to this change.
  **Zero advisories** in the `isomorphic-git` / `buffer` subtree at the installed versions.
- **Historical iso-git CVE:** `CVE-2021-30483` / `GHSA-fgxq-p49f-qw99` — directory traversal,
  **low** severity (CVSS 3.1), fixed in **v0.78.0** (2021). Hundreds of releases and ~5 years
  before our `1.38.3`. Not applicable.
- **`buffer`:** no open advisories.

No advisory affects this project's usage. Note also that iso-git runs in a **Web Worker over OPFS**
here, not against an untrusted server checkout — the most security-relevant iso-git surface
(remote fetch/clone of attacker-controlled repos) is constrained to repos the user themselves
configures as their corpus remote.

### Transitive Dependency Surface

New transitive packages pulled in (full list from the lockfile diff):

```
abort-controller, async-lock, clean-git-ref, crc-32, decompress-response, diff3,
event-target-shim, events, ieee754, mimic-response, minimisted, once, pify, process,
readable-stream, safe-buffer, sha.js, simple-concat, simple-get, string_decoder,
to-buffer, wrappy  (+ base64-js/ieee754 already present for buffer)
```

iso-git's own declared deps are a small, well-known set:
`async-lock, clean-git-ref, crc-32, diff3, ignore, minimisted, pako, pify, readable-stream,
sha.js, simple-get`. These are mature, single-purpose utility libraries. The largest sub-tree
comes from `simple-get` (http helper: `decompress-response`, `mimic-response`, `simple-concat`)
and the streams polyfill chain (`readable-stream`, `string_decoder`, `safe-buffer`, `events`).
Nothing exotic, no native modules, no install scripts of concern. Transitive surface is
**modest and conventional** for a pure-JS git implementation.

### License Compatibility

All new direct and transitive packages are permissive — **no copyleft**:

| License | Packages |
|---------|----------|
| MIT | isomorphic-git, buffer, async-lock, diff3, simple-get, pify, minimisted, ignore, readable-stream, abort-controller, decompress-response, mimic-response, simple-concat, to-buffer, events, process, base64-js, ieee754 |
| Apache-2.0 | clean-git-ref, crc-32 |
| ISC | once, wrappy |
| MIT AND Zlib | pako |
| MIT AND BSD-3-Clause | sha.js |

All compatible with a closed-or-open web app. No license blocker.

### Bundle-Size Impact

- Installed iso-git footprint: ~5.1 MB on disk (includes maps + multiple build formats).
- Shippable builds: `index.umd.min.js` ≈ **256 KB minified** (pre-gzip); ESM/CJS ≈ 516–520 KB unminified.
- **Mitigating factor:** per DD-009 / S3 design, iso-git runs in a **Web Worker**, so its weight
  is off the main-thread critical path and out of the initial page bundle. `buffer` adds a small
  polyfill. Bundle impact is acceptable and intentionally isolated.

### `^1.38.3` Pin Assessment

`^1.38.3` is a **sensible pin**:
- `^` allows non-breaking 1.x updates, which matters because iso-git ships frequently (8 releases
  in ~5 weeks) and uses semantic-release, so caret keeps security/bugfix patches flowing without
  manual bumps.
- `1.38.3` is the current latest, so we start at HEAD rather than carrying a stale floor.
- The `package-lock.json` pins the exact resolved tree, so reproducible installs are preserved
  regardless of the caret range. Recommend keeping the lockfile committed (it is, in this diff).
- No reason to over-pin to an exact version; iso-git's 1.x line has been stable and the project
  follows semver via automated releases.

### Rollback Plan (precondition)

This is an additive new dependency on a feature branch that is not yet merged, so rollback is
trivial — there is no production code path depending on it until S3 lands. Rollback = do not merge,
or revert the dep add.

**Exact rollback commands** (if the add must be undone after install on a working branch):
```
git checkout feat/corpus-architecture -- package.json package-lock.json
npm ci
```
(If iso-git import sites have already been added in S3 code, also revert those source files; the
worker module is self-contained, so removing the dep + its single worker entry point fully unwinds it.)

**Verification step** (run after rollback; must pass to confirm rollback worked):
```
npm run build && npm test
```
`npm ci` against the restored lockfile would fail if the lockfile didn't fully revert, and the
build would fail on any dangling iso-git import — either makes a botched rollback observable.

**Rehearsal status:** [ ] Not rehearsed — N/A as a hard blocker for a not-yet-merged additive
dep. The revert is a single `git checkout` of two manifest files plus `npm ci`; there is no data
migration or one-way state change to unwind. If the reviewer wants belt-and-suspenders, rehearse
on a scratch branch with the two commands above before merge.

### Go / No-Go

**GO.** Land the dependency add.

Rationale: the deps are clean on every supply-chain axis — actively maintained (release ~1 week
ago), current pin, no open CVEs in the iso-git/buffer subtree, only the unrelated pre-existing
next/postcss moderates in the wider tree, permissive licenses throughout, a modest and conventional
transitive surface, and bundle weight isolated to a Web Worker. The single-maintainer concern
DD-009 raised is real but (a) softened by 3 npm publishers, (b) far from its own revisit thresholds,
and (c) already tracked as a revisit trigger rather than a merge blocker. There is no blocking
supply-chain reason not to ship S3.

### Recommended Follow-ups (non-blocking)

1. Keep the DD-009 revisit trigger live: re-check iso-git release recency if a year passes with no
   new release, or immediately if a critical CVE is published against the installed range.
2. Address the pre-existing `next`/`postcss` moderate advisories separately (out of scope for S3,
   but worth a tracking issue so this audit noise doesn't mask a future real finding in this subtree).
3. Confirm the lockfile (`package-lock.json`) is committed with the PR (it is in this diff) so the
   resolved transitive tree is reproducible.

---

## Goal-Alignment Note

**Stated goal:** Evaluate the DD-009 S3 dependency add (`isomorphic-git`, `buffer`) for
supply-chain / maintenance risk before the PR opens, and produce a go/no-go saved to
`docs/reviews/dependency-upgrade-s3.md`.

**What this review did:** Inspected the actual dep diff
(`feat/corpus-architecture..feat/corpus-git-pipeline`), the installed tree (`npm ls`), the
installed `isomorphic-git/package.json`, `npm audit`, npm registry metadata (latest version,
release dates, maintainer list), the historical CVE record, all new transitive licenses, and the
on-disk/shippable bundle footprint. Cross-checked findings against DD-009's documented
single-maintainer concern and its concrete revisit triggers.

**Where it aligns:** Scope was kept proportionate as requested — functionality/perf were taken as
already-validated by the two spikes, and the question answered was narrowly "any blocking
supply-chain reason not to land it." Verdict: **GO**, Low risk.

**Caveats / what was NOT done:** No runtime/functional re-verification (deferred to the spikes by
design). The rollback was not rehearsed because the dep is additive and not yet merged — the
report documents exact revert commands and a verification step instead. The single-maintainer tax
is acknowledged, not eliminated; it remains a tracked DD-009 revisit trigger.

**Sources:**
- [isomorphic-git — npm](https://www.npmjs.com/package/isomorphic-git)
- [isomorphic-git releases](https://github.com/isomorphic-git/isomorphic-git/releases)
- [CVE-2021-30483 / GHSA-fgxq-p49f-qw99 (directory traversal, fixed v0.78.0)](https://github.com/advisories/GHSA-fgxq-p49f-qw99)
