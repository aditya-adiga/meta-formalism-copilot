# Test Strategy Review — `feat/vercel-filesystem-compat`

Commit: b64c1cade4a69a4a5154f6cd67aa30ce7cf8841b

## Scope

Branch diff vs `origin/main` (3 files, +21/-2):

- `app/lib/utils/dataDir.ts` — new 4-line helper that branches on `process.env.VERCEL`
  to return `/tmp` (Vercel) or `<cwd>/data` (everywhere else), optionally joined with
  subpaths.
- `app/lib/analytics/persist.ts` — replaces a literal `join(process.cwd(), "data")`
  with `dataDir()`.
- `app/lib/llm/cache.ts` — replaces `join(process.cwd(), "data", "cache")` with
  `dataDir("cache")`.

No tests were added on this branch.

## Test Conventions (project)

- **Framework:** Vitest with jsdom env (`vitest.config.ts`), globals on, React Testing
  Library available via setup file.
- **Layout:** unit tests live next to the implementation as `<name>.test.ts(x)`. A
  couple of areas use `__tests__/` (e.g. `app/lib/stores/__tests__/`), but the
  surrounding directories — `app/lib/utils/`, `app/lib/llm/` — uniformly use the
  sibling pattern. The closest existing analogue, `app/lib/llm/costs.test.ts`, uses
  sibling-file convention with table-style `describe`/`it` blocks and pure-function
  assertions. That is the right pattern to follow here.
- **No env-mocking helpers** are imported anywhere in the suite today; tests that
  need `process.env` would just save/restore in `beforeEach`/`afterEach`. Vitest's
  `vi.stubEnv` is also available without setup.

## Risk Profile

`dataDir()` is a 4-line pure function, but it encodes a **deployment invariant**:
"on Vercel we must write to `/tmp`, everywhere else we use `cwd/data`." Properties:

- **Blast radius:** medium-to-high but asymmetric.
  - If the Vercel branch is removed/inverted, production deploys silently fail at
    runtime when analytics/cache writes hit a read-only filesystem (EROFS). The
    failure is not visible during local dev or `npm run build`.
  - If the non-Vercel branch breaks, every dev machine and self-hosted deploy
    immediately fails — caught instantly.
  - So the asymmetry is the whole reason this is interesting: the production-only
    path has no other guard. Lint won't catch a regression, types won't catch it,
    `npm test` won't catch it, and CI build won't exercise it.
- **Change frequency:** low. The helper exists precisely so the env check lives in
  one place.
- **Surface area:** two consumers today (`persist.ts`, `cache.ts`). A third consumer
  added without re-reading `dataDir`'s docstring is a plausible future regression
  vector — e.g. someone uses `process.cwd()` directly for a new on-disk feature.
- **Implementation subtlety:** `process.env.VERCEL` is truthy-checked, so any
  non-empty string works (Vercel sets it to `"1"`). That matches Vercel's actual
  behavior and the test should assert on string values, not booleans.

## Recommended Tests

### `dataDir()` env-branching unit test

**Type:** unit
**Priority:** medium-high (small cost, catches a class of silent prod regressions
nothing else covers)
**File:** `app/lib/utils/dataDir.test.ts` (sibling convention, matching
`pdfPropositionParser.test.ts` / `textSelection.test.ts`)
**What it verifies:** `dataDir()` returns `/tmp`-rooted paths iff `process.env.VERCEL`
is set, and joins subpaths correctly under both bases.
**Key cases:**
- `VERCEL` unset → returns `join(process.cwd(), "data")` with no subpaths.
- `VERCEL` unset, one subpath `"cache"` → returns `join(process.cwd(), "data", "cache")`.
- `VERCEL` unset, multiple subpaths → joined in order under `data/`.
- `VERCEL = "1"` → returns `"/tmp"` with no subpaths.
- `VERCEL = "1"`, one subpath `"cache"` → returns `"/tmp/cache"`.
- `VERCEL = ""` (empty string) → falls through to non-Vercel branch (documents the
  truthy-check semantics; cheap to include).

**Setup needed:** `vi.stubEnv("VERCEL", ...)` per case with `vi.unstubAllEnvs()` in
`afterEach`. No fs mocking — this is a pure path-string function. Use `path.join`
in expectations rather than hardcoded separators so the test runs on both Linux
and Windows dev machines (though the project is Linux-first; minor point).

**Cost estimate:** ~20 minutes including running the suite. ~30 lines of test code.

### What this test buys you concretely

The realistic regression scenarios it catches:

1. Someone refactors `dataDir` and accidentally inverts the branch, or drops the
   env check entirely (e.g. "simplify" sweep). Production breaks; local tests
   stay green without this test. With this test, CI fails immediately.
2. Someone changes `"VERCEL"` to a different env name (`"VERCEL_ENV"`,
   `"NEXT_PUBLIC_VERCEL"`, etc.) without realizing the original is the deploy-set
   sentinel. Caught.
3. The variadic `subpaths` argument gets reworked (e.g. switched to a single
   string) and silently breaks `cache.ts`'s `dataDir("cache")` call. Caught.

It does **not** catch: actual filesystem permissions on Vercel, cold-start data
loss, or the consumers' use of the path. Those are deployment concerns and are
explicitly out of scope for a unit test.

## What NOT to Test

- **`persist.ts` / `cache.ts` integration with `dataDir()`.** The integration is a
  one-line constant assignment; a test would either re-test `dataDir` itself or
  pin the literal path string, which is brittle. The existing untested behavior of
  these modules (file reads/writes/appends) was untested before this branch and
  this PR doesn't change it. If we want coverage there it's a separate, larger
  scope (mocking `fs`, exercising `appendAnalyticsEntry` round-trips, etc.) —
  worth doing eventually but unrelated to the deploy-compat fix.
- **End-to-end "does the app run on Vercel" test.** That requires a real
  deployment and is a smoke-test concern, not a unit test. The `README` Deploy
  to Vercel section is the right place to document this manual check.
- **A test that asserts the exact string `"/tmp"`.** Already covered by the
  recommended unit test; no need for a separate one.

## Coverage Gaps Beyond Current Scope

Noted but out of scope for this branch:

- `app/lib/analytics/persist.ts` has zero tests. It uses synchronous `fs` calls and
  parses JSONL with try/catch — there is real logic in the corrupt-line skip and
  empty-file behavior. A small Vitest suite using `memfs` or a tmpdir would be
  worth ~1 hour and would cover `appendAnalyticsEntry` / `readAnalyticsEntries` /
  `clearAnalyticsEntries` round-trips. Flag for future test-strategy session.
- `app/lib/llm/cache.ts` has zero tests. The hash function is deterministic and
  trivially testable; the `getCachedResult` corrupt-file fallback path is the
  interesting case. Lower priority than `persist.ts` because cache misses are
  recoverable.
- Neither of those gaps is created or worsened by this branch. They predate it.

## Bottom Line

**Recommend writing the one `dataDir.test.ts` file.** It's the cheapest possible
guard for an asymmetric, deploy-only failure mode that no other tooling in this
repo will catch. Skip everything else for this PR.

Priority ranking:

1. **`dataDir()` env-branching unit test** — recommended, ~20 min.
2. `persist.ts` round-trip tests — defer to a separate PR; not blocking.
3. `cache.ts` corrupt-file fallback test — defer; low priority.
