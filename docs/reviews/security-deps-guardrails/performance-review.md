# Performance Review: feat/security-deps-guardrails

Commit: 8bde50c4bdb571dd83f6d53c779eb343cf1b237d
Scope: `git diff origin/main...HEAD` (2 commits, 3 files: `.github/workflows/ci.yml`, `eslint.config.mjs`, `package-lock.json`)

> **No code fact-check report provided.** Performance claims in comments and documentation have not been independently verified. For full verification, run the `code-fact-check` skill first or use the code-review orchestrator.

## Data Flow and Hot Paths

This branch makes three changes, all in cold paths:

1. **CI pipeline** (`.github/workflows/ci.yml`) — adds an `npm audit --omit=dev --audit-level=high` step at the end of the matrix job (Node 20, Node 22). Runs on push to `main` and on PRs. Not user-facing; cost is measured in GitHub Actions minutes.
2. **ESLint config** (`eslint.config.mjs`) — adds three rules: `no-restricted-imports` (one path: `rehype-raw`), `no-restricted-syntax` (one AST selector: `Property[key.name='trust'][value.value=true]`), and `react/no-danger` at `warn`. Runs during `npm run lint` (CI + local). Not in the rendered app's runtime.
3. **Dependency bumps** in `package-lock.json`: `@xmldom/xmldom` 0.8.11 → 0.8.13 (patch, transitive via `mammoth`), `lodash` 4.17.23 → 4.18.1 (transitive via `dagre` → `graphlib`). Both are inside libraries already in use; no new install footprint.

There is no application-runtime code in this diff. The "hot path" question reduces to: does the CI step add meaningful build-time, and does the ESLint config add meaningful lint-time?

## Findings

#### Audit step is serial after build, not parallel — small CI-minute cost

**Severity:** Low
**Location:** `.github/workflows/ci.yml:45-46`
**Move:** #3 Find the work that moved to the wrong place
**Confidence:** High

The audit step is appended sequentially to the same job that runs lint, test, type-check, and build. `npm audit` only needs the lockfile and the registry — it does not need the build artifacts or test outputs. Because the matrix runs both Node 20 and Node 22, the audit cost is paid twice on every PR even though the lockfile result is identical across Node versions (audit reads `package-lock.json`, not the installed Node runtime).

Path is cold (CI, not user-facing). Realistic cost: an `npm audit` against a lockfile of ~1500 entries typically takes 5-20s; doubled by the matrix → ~10-40s per CI run. This is well below the threshold for action and is dominated by the ~minutes-long install/build steps that already run twice.

**Recommendation:** No change needed for this PR. If CI minutes become a constraint later, two cheap improvements are available: (a) split audit into a separate single-version job that runs in parallel with the build matrix, removing it from the critical path; (b) gate it on `if: matrix.node-version == 20` so it runs once. Neither is worth doing pre-emptively.

#### `no-restricted-syntax` AST selector is cheap on this codebase

**Severity:** Informational
**Location:** `eslint.config.mjs:50-56`
**Move:** #1 Count the hidden multiplications
**Confidence:** High

`no-restricted-syntax` runs the selector `Property[key.name='trust'][value.value=true]` against every AST node in every linted file. ESLint's selector engine (esquery) evaluates this as a constant-cost predicate on every `Property` node; it does not materialize a full match set. For a Next.js codebase of this size, the added work per file is on the order of microseconds, dominated by lint-rule overhead that already exists. `no-restricted-imports` is even cheaper — it inspects only `ImportDeclaration` nodes against a single string. `react/no-danger` at `warn` is a built-in rule with negligible cost.

Cold path (lint runs in CI and pre-commit, not in the served app). No measurable impact.

**Recommendation:** No action. Worth noting because AST-selector rules can be expensive when their selectors are written greedily (e.g., `*[name='x']` traverses every node type); this one is correctly scoped to `Property`.

#### Dependency bumps are patch-level, no runtime impact expected

**Severity:** Informational
**Location:** `package-lock.json` (lodash 4.17.23 → 4.18.1, @xmldom/xmldom 0.8.11 → 0.8.13)
**Move:** #3 Find the work that moved to the wrong place
**Confidence:** Medium

Both are transitive: `lodash` is reached only via `dagre` → `graphlib` (graph layout, runs client-side once per graph render in `GraphPanel`/`CausalGraphPanel`); `@xmldom/xmldom` is reached only via `mammoth` (DOCX parsing in `FileUpload`, once per uploaded file). Neither sits in a per-request, per-frame, or per-keystroke loop.

The `lodash` bump from 4.17.23 to 4.18.1 is a minor version jump and does include some changes to internals; `@xmldom/xmldom` 0.8.11 → 0.8.13 is patch-level. Both libraries have stable APIs and the consumers (`graphlib`, `mammoth`) pin via semver ranges that accept these versions. No code change is required and no behavioral regression is expected at the call sites.

Confidence is Medium rather than High because I did not read the lodash 4.18.1 changelog to confirm no consumer-visible behavioral changes in the specific functions `graphlib` calls. If `dagre` graph layout starts misbehaving (rare), this would be the suspect.

**Recommendation:** No action. If graph layout regressions appear post-merge, check `graphlib`'s lodash usage as a first step.

## What Looks Good

- **Audit scope is correctly narrowed.** `--omit=dev` excludes dev-only deps from the audit gate. Dev deps (vitest, eslint, etc.) don't ship to users, so failing CI on a CVE in `vitest` would be noise that delays unrelated work. This is the right call.
- **Audit threshold is appropriate.** `--audit-level=high` filters out moderate/low advisories, which on the npm registry are frequently false-positive-heavy and add noise without adding security. The comment in `ci.yml:42-44` justifies the choice clearly.
- **AST selector is precisely scoped.** `Property[key.name='trust'][value.value=true]` matches only the literal `trust: true` pattern on object property keys. It will not match `trust: someVariable`, computed keys, or non-Property nodes. The comment correctly identifies that the broad applicability is intentional.
- **Lint rules are guardrails, not active workload.** Each rule is defensive against a future regression rather than a transformation of existing code. Their cost is paid only at lint time, not at build or runtime.

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 1 | Audit step is serial after build, not parallel | Low | `.github/workflows/ci.yml:45-46` | High |
| 2 | `no-restricted-syntax` AST selector is cheap | Informational | `eslint.config.mjs:50-56` | High |
| 3 | Dependency bumps are patch-level, no runtime impact expected | Informational | `package-lock.json` | Medium |

## Overall Assessment

This branch has no meaningful performance signal. All three changes are in cold paths: CI scripts, lint config, and transitive dependency patches. The `npm audit` step adds ~10-40 CI-seconds per run (doubled by the Node version matrix) but is dominated by the existing install/build/test steps and is not on a latency-sensitive path. The new ESLint rules add negligible per-file lint work and are scoped correctly so they will not become hot. The lodash and `@xmldom/xmldom` bumps are reached only through `dagre` (client-side graph layout, once per render) and `mammoth` (DOCX upload, once per file) — neither is a request-frequency hot path, and both bumps are within-major and unlikely to change behavior at the call sites.

If anyone wants to optimize CI further later, the cheapest move is to peel `npm audit` off the build matrix into its own single-version job so it runs in parallel rather than after the critical path; this would shave ~10-20s off PR feedback time. Not worth doing in this PR.

No profiling or benchmarking is required to validate these conclusions — all of them are visible from the code structure and dependency graph.
