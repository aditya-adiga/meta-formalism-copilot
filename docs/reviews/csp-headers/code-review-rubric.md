# Code Review Rubric — feat/csp-headers

**Scope:** `origin/main..HEAD` on `feat/csp-headers` | **Reviewed:** 2026-04-27 | **Status: ✅ PASSES REVIEW**

Commit at review time: `d90d6bb` (post-simplifier)

---

## 🔴 Must Fix

| # | Finding | Domain | Location | Status |
|---|---|---|---|---|
| R1 | `connect-src 'self'` blocks `data:` URLs and breaks PNG graph export at runtime — `exportGraph.ts:24,37` does `fetch(dataUrl)` on `data:` URIs from `html-to-image`. Functional regression. | Security (Medium → escalated due to runtime-breakage) | `app/lib/utils/exportGraph.ts:24,37` | ✅ Resolved — switched to `toBlob` so no `fetch(dataUrl)` is needed; CSP stays strict. |
| R2 | `proxy.ts:35-36` comment claims Edge runtime, but Next 16 Proxy defaults to Node.js runtime. Code works either way but the doc-claim is wrong. | Fact-check (Incorrect, high confidence) + API consistency (Minor) | `proxy.ts:35-36` | ✅ Resolved — comment now says "Node.js runtime Next 16 Proxy runs on by default". |

---

## 🟡 Must Address

| # | Finding | Domain | Source | Status | Author note |
|---|---|---|---|---|---|
| A1 | CSP set on response only; canonical Next.js 16 docs example sets it on both forwarded request and response. | API consistency (Inconsistent) | api-consistency-reviewer | ✅ Resolved | `requestHeaders.set("Content-Security-Policy", csp)` added before `NextResponse.next`. |
| A2 | `style-src 'unsafe-inline'` rationale comment blames Tailwind v4, but Tailwind v4 emits external CSS — the real cause is React `style={{...}}` props (graph nodes, refinement preview, collapsible sections) plus Next.js's SSR style injection. | Fact-check (Mostly Accurate) + Security (Low) | code-fact-check + security-reviewer | ✅ Resolved | Comment updated to reflect actual sources of inline styles. |
| A3 | `app/layout.tsx:27-30` comment misstates *why* `await headers()` is needed (proxy.ts already runs per request via its matcher; the real reason is to opt the layout into dynamic rendering so Next.js injects the nonce into bootstrap scripts during render). | Fact-check (Mostly Accurate) + API consistency (Minor) + Performance (advisory) | code-fact-check + api-consistency + performance | ✅ Resolved | Comment rewritten. |
| A4 | No tests pin the CSP directive list — silent regressions (someone weakening `script-src`/`connect-src` during refactor) wouldn't fail anything. | Test-strategy | test-strategy-reviewer | ✅ Resolved | Added `proxy.test.ts` with directive snapshot, dangerous-source guards, and stable-order check. `buildCsp` exported for testing. |

---

## 🟢 Consider

| # | Finding | Source |
|---|---|---|
| C1 | `form-action` does not fall back to `default-src` (CSP3); explicit `form-action 'self'` is zero-cost defense-in-depth. | security-reviewer | (Applied — added to directive list and pinned in test.) |
| C2 | UUID-based nonce carries 122 bits of entropy, just under conventional ≥128 bits. `crypto.getRandomValues(new Uint8Array(16))` gives full 128 bits with clearer intent. | security-reviewer | (Applied — switched to `getRandomValues(Uint8Array(16))`.) |
| C3 | Loss of static rendering for root layout — `await headers()` opts the layout dynamic. Cost is small because `app/page.tsx` is already a client component; only the `<html>`/`<body>` shell loses static-render. Load-bearing for CSP correctness. | performance-reviewer |
| C4 | `connect-src 'self'` is a forward-looking tripwire for any future browser-originated third-party calls (e.g., direct OpenAlex from the client). Update CSP at the same time. | api-consistency + security |
| C5 | Eight of nine directives are static; could hoist a constant prefix. Not worth it at this traffic. | performance-reviewer |
| C6 | Deeper coverage gap: no direct tests for any `app/api/*/route.ts` handler. Out of scope for this branch but worth a separate test-strategy session. | test-strategy-reviewer |
| C7 | Could move `EXPORT_BG` constant near the `toBlob` call but it's already at module scope — fine as-is. | code-fact-check follow-up |

C1, C2 applied opportunistically. Others are advisory.

---

## ✅ Confirmed Good

| Item | Verdict | Source |
|---|---|---|
| Nonce + `'strict-dynamic'` is the state-of-the-art CSP pattern | ✅ Confirmed | security-reviewer |
| `frame-ancestors 'none'`, `base-uri 'self'`, `object-src 'none'` correctly chosen | ✅ Confirmed | security-reviewer |
| Matcher correctly excludes `api`, `_next/static`, `_next/image`, `favicon.ico`, prefetches | ✅ Confirmed | performance + security |
| Per-request nonce cost is sub-microsecond; no perf concern | ✅ Confirmed | performance-reviewer |
| Dynamic-render switch is contained — no cache invalidation, no API re-execution, no per-asset proxy invocation | ✅ Confirmed | performance-reviewer |
| File name (`proxy.ts` not `middleware.ts`), exported `proxy` function shape, `x-nonce` lowercase-hyphenated header — all match Next.js 16 conventions | ✅ Confirmed | api-consistency |
| Internal request-header → `headers()` protocol is canonical Next.js, not invented | ✅ Confirmed | api-consistency |
| 7 of 12 in-branch claims fully verified | ✅ Confirmed | code-fact-check |

---

To pass review: all 🔴 items must be resolved. All 🟡 items must be either fixed or carry an author note. 🟢 items are optional.

**Status:** All 🔴 + 🟡 items resolved with code changes. C1 + C2 applied opportunistically. No blockers remain.
