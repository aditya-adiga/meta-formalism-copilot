# Test Strategy: feat/csp-headers

Commit: d90d6bb40ae285df709c089f6babd337f6c4d22c
Branch: feat/csp-headers (vs origin/main)
Scope: `proxy.ts` (new, 64 LOC) and `app/layout.tsx` (forced dynamic via `await headers()`).

## TL;DR

Write **one** small unit test: a snapshot/structural test of `buildCsp` to lock the
directive list against accidental weakening. Skip everything else.

`npm run build` + a manual cURL header check is sufficient for the request-handling
half of `proxy.ts`. The wiring is too thin and too coupled to Next's runtime to be
worth a Vitest harness — the project has no precedent for testing
`NextRequest`/`NextResponse`, no fixtures for it, and the bug shape that would slip
past `npm run build` is narrow.

---

## Test Conventions

- **Framework:** Vitest 4 + `@testing-library/react`, jsdom environment, globals on.
- **Location:** Co-located `.test.ts(x)` next to the implementation, with a few uses
  of `__tests__/` for stores. New tests for `proxy.ts` would live at
  `proxy.test.ts` in the repo root.
- **Style:** Plain `describe`/`it`/`expect`, AAA. No table-driven helpers, no MSW,
  no API-route harness.
- **Existing coverage of Next.js infrastructure:** None. There are no tests that
  import from `next/server`, no tests for any `app/api/*/route.ts` handler, and
  no fixtures for building a `NextRequest`. Adding a `NextRequest` test harness
  for one file would be the most expensive part of a proxy test, not the test
  logic itself.
- **Tested elsewhere (relevant precedent):** Pure utility/library code is well
  tested (`costs.test.ts`, `transformSseStream.test.ts`,
  `pdfPropositionParser.test.ts`). That pattern is exactly the seam for
  `buildCsp`.

## Risk Profile

`proxy.ts` has three pieces, ranked by blast radius:

1. **`buildCsp(nonce)` directive list — high blast radius, silent failure mode.**
   A typo or accidental edit to `connect-src 'self'`, `script-src`, `object-src
   'none'`, or `frame-ancestors 'none'` either (a) silently weakens the security
   posture in a way no functional test will catch, or (b) breaks all
   browser-side JS / network calls / styles in a way that *will* be caught, but
   only if someone loads the app. Snapshotting this list is cheap and
   appropriate.
2. **`proxy()` request/response wiring — medium blast radius, loud failure mode.**
   If the nonce isn't forwarded as `x-nonce`, or the CSP header isn't attached,
   the page either fails to hydrate (Next strips its own `<script>` tags without
   the nonce match) or browser console spams CSP violations. Both are caught by
   `npm run build` followed by loading `/` once. There is no subtle silent-bug
   pathway here — the failure is visible on the first page view.
3. **`config.matcher` — medium blast radius, loud failure mode.** Wrong matcher
   either applies CSP to API routes (breaking JSON responses with a header that
   doesn't matter — visible only in DevTools) or fails to apply CSP to `/`
   (visible immediately because the script-src nonce won't be present). Not
   worth a test; matcher syntax is a Next.js contract, not our logic.

The change in `app/layout.tsx` (`await headers()` to opt into dynamic rendering)
is a one-liner whose failure mode is "the proxy doesn't run on prerendered HTML
and the CSP header isn't attached" — caught by the same single page view that
verifies the proxy itself.

## Recommended Tests

### CSP directive list snapshot

**Type:** unit (snapshot-style, but written as explicit assertions for review clarity)
**Priority:** high
**File:** `/home/magfrump/aisc_lct/meta-formalism-copilot/proxy.test.ts`
**What it verifies:** The exact set of CSP directives emitted by `buildCsp`,
locked against accidental weakening during refactors.
**Key cases:**
- `buildCsp("test-nonce")` returns a string containing each of the nine
  directives, joined with `; ` separators.
- `script-src` includes both `'nonce-test-nonce'` and `'strict-dynamic'`. (The
  combination is what makes nonces useful — strict-dynamic without a nonce
  source is a footgun, and nonce without strict-dynamic doesn't cover
  Next's loader scripts.)
- `frame-ancestors 'none'`, `object-src 'none'`, and `base-uri 'self'` are
  present. These are clickjacking / plugin-injection / base-URI-injection
  defenses that are easy to delete during a "tidy up the directives" refactor.
- `connect-src 'self'` is present and does **not** include any third-party
  origins. The decision record in proxy.ts's docstring asserts that all
  outbound LLM calls are server-side; this test pins that invariant. If a
  future change adds `https://api.anthropic.com` to `connect-src`, the test
  failure will force the author to confirm whether the architecture has
  actually changed or whether the directive was added by mistake.
- `default-src 'self'` is the first directive (so any directive we forget to
  set falls back to self-only).

**Setup needed:** None. Pure function, no mocks. Import `buildCsp` directly.

> **Implementation note:** `buildCsp` is currently not exported. Mark it
> `export` to enable testing — exporting a helper for tests is cheap and the
> function name is self-documenting (low risk of misuse from outside).

### What NOT to Test

- **`proxy(request)` end-to-end via a synthesized `NextRequest`.** Possible —
  `new NextRequest(new Request("http://localhost/"))` works in jsdom — but
  the assertions you'd write (CSP header set, `x-nonce` request header set,
  `NextResponse.next()` returned) are just re-asserting that the four-line
  function calls the four functions it calls. Tests that mirror the
  implementation 1:1 catch typos at the cost of doubling the maintenance
  surface. The `npm run build` + manual page load already catches every
  failure mode this test would catch, more reliably.
- **`config.matcher` regex behavior.** This is a Next.js contract. Testing it
  means testing Next, not our code. Verify once manually by hitting `/api/...`
  and `/` and confirming only `/` gets the CSP header.
- **Nonce uniqueness / per-request freshness.** `crypto.randomUUID()` is the
  contract. Testing "two calls produce different values" tests `crypto`, not
  us.
- **The `await headers()` change in `app/layout.tsx`.** One-line opt-in to
  dynamic rendering; failure mode is loud and immediate. Adding a server-render
  test for the layout would require setting up a Next.js test runner the
  project doesn't have.

### Integration test via `npm run build` + header smoke check

**Recommendation: do not add as an automated test. Add as a checklist item.**

A Vitest test that boots a Next.js server, fetches `/`, and asserts on the
`Content-Security-Policy` response header is technically possible but expensive
in this project:

- No existing test does anything like this. Adding it means choosing between
  `next start` (requires a build first → multi-second test setup) or a
  dev-server harness (different code path from prod, partially defeats the
  point).
- The runtime cost is order-of-magnitude higher than every other test in the
  suite. This will be the slowest test by far and the first one people will
  want to skip.
- The bug it catches — "CSP header not attached on `/`" — is caught the first
  time anyone loads the dev server, and Next's CSP integration is a stable
  framework feature, not project logic.

**What to do instead:** Add to a manual verification checklist (e.g. in the PR
description or in a `docs/reviews/csp-headers/` checklist file):

1. `npm run build && npm start`
2. `curl -I http://localhost:3000/` → expect `Content-Security-Policy` header
   with `script-src` containing `'nonce-...'` and `'strict-dynamic'`.
3. `curl -I http://localhost:3000/api/formalize` (or any API route) → expect
   **no** CSP header.
4. Load `/` in a browser, open DevTools console → expect zero CSP violation
   warnings. (Tailwind inline styles are allowed by `style-src 'unsafe-inline'`;
   if that directive ever changes, this is the canary.)
5. View source on `/` → expect every Next bootstrap `<script>` tag to have a
   `nonce="..."` attribute matching the response header's nonce.

If this verification ever becomes flaky enough to need automation, revisit —
but spending the harness-setup cost preemptively isn't justified by the
current risk.

## Coverage Gaps Beyond Current Scope

- **No API route handler tests anywhere in the project.** `app/api/*/route.ts`
  files implement formalization, decomposition, editing, and verification —
  the actual product surface — and have zero direct test coverage. They're
  presumably exercised end-to-end through hook/component tests, but contract
  tests on the route handlers (request shape, error responses, streaming
  behavior) would catch a much larger class of regressions than anything in
  this branch's scope. Worth raising as a separate test-strategy session if it
  hasn't been.
- **No CSP-violation regression catch for future component additions.** If
  someone later adds an `<img src="https://...">` from a third-party CDN, or a
  client-side `fetch('https://api.example.com')`, the current CSP will block
  it but no test will fail — only a manual page load will reveal it. A
  Playwright-based smoke test that loads `/` and fails on any CSP violation
  console message would be the right tool, but it's a larger investment than
  this branch warrants.

## Summary

Add one test file (`proxy.test.ts`) with ~5 assertions on `buildCsp`. Export
`buildCsp` to make this possible. Skip middleware-runtime tests; rely on
`npm run build` + a one-time manual header check (documented as a checklist)
for the request/response wiring. The honest answer for the proxy handler half
is "the test would mirror the implementation, so don't write it."
