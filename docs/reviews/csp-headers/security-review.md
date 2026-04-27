# Security Review — `feat/csp-headers`

Commit: d90d6bb40ae285df709c089f6babd337f6c4d22c
Branch: `feat/csp-headers`
Diff scope: `git diff origin/main...HEAD` — `proxy.ts` (new, 64 lines) and `app/layout.tsx` (+8/-1).
Reviewer: security-reviewer skill (standalone), with a fact-check report provided as informational context.

## Trust Boundary Map

The CSP proxy sits at the HTTP boundary, attaching a `Content-Security-Policy`
header to every page-navigation response and forwarding a per-request nonce
to server components via the `x-nonce` request header. The trust boundary
introduced/strengthened here is the **browser execution boundary**: untrusted
content (markdown, LaTeX, PDF-extracted text, LLM output, user input) is
rendered into the same DOM as trusted application code, and CSP is the
browser-side enforcement layer that prevents attacker-controlled strings from
becoming executable scripts.

What enters from outside this code:
- Every HTTP request (the proxy runs on each non-static, non-API navigation).
- The nonce is generated server-side and is the only secret in the flow; it
  must be unguessable per request and must not be reused.

What leaves to somewhere else:
- The CSP header travels to the browser (public).
- The nonce travels to the browser embedded in `<script nonce="...">` tags
  rendered by Next.js. (Public on the wire — that is fine; CSP nonces are
  not credentials, they are integrity tokens scoped to a single response.)
- The nonce is forwarded to the rendering pipeline via the `x-nonce` request
  header.

What this code assumes about its inputs:
- That `crypto.randomUUID()` is a CSPRNG (true on both Edge and Node.js
  runtimes — both expose Web Crypto's `crypto`).
- That Next.js will pick up `x-nonce` from request headers and apply it to
  its own bootstrap scripts when the page is dynamically rendered. The
  layout opts into dynamic rendering via `await headers()` so this holds.

---

## Findings

### 1. `style-src 'unsafe-inline'` — justification is real but the comment mistargets it

**Severity:** Low
**Location:** `proxy.ts:23` (and the explanatory comment at `proxy.ts:12-14`)
**Move:** #2 (find the implicit assumption)
**Confidence:** High

The directive is `style-src 'self' 'unsafe-inline'`. The in-file comment
attributes this to "Tailwind v4 emits inline styles." That is incorrect:
Tailwind v4 with `@tailwindcss/postcss` (used here per `package.json`) emits
an external stylesheet, not inline `<style>` blocks. A grep of the codebase
shows ~30+ React `style={{...}}` props across panels, layout, output editing,
and graph components — those, plus Next.js's framework-emitted runtime
styles and React-Flow's node positioning styles, are the real reason
`'unsafe-inline'` is needed today.

The *security posture* is unchanged either way: `'unsafe-inline'` for styles
is a real but bounded weakening of CSP (it permits CSS injection that could
be used for data exfiltration via, e.g., attribute selectors and
`background-image: url(...)` plus a non-`'self'` `img-src`, but here
`img-src 'self' data: blob:` excludes off-origin URLs, which mitigates the
classic CSS-exfil pattern). However, the rationale in the comment is wrong,
which means a future reviewer who removes `style={{...}}` props (the actual
cause) and keeps Tailwind (the cited cause) might leave `'unsafe-inline'`
in place "because Tailwind needs it," missing the chance to tighten.

**Recommendation:** Update the comment to reflect the real cause: many
React `style={{...}}` props throughout the UI (e.g., `IconRail`,
`CausalGraphNode`, `ProofGraphNode`, `EditableOutput`, `GraphPanel`,
`WorkspaceSessionBar`, etc.) plus Next.js / React-Flow framework styles. If
moving to nonced styles is desired later, the migration target is those
props (replace with classes or CSS variables), not Tailwind. As a near-term
hardening, consider also adding `'unsafe-hashes'` only and per-style hashes
for the small number of static inline styles, leaving dynamic-only sites
(positioning, progress bars) on `'unsafe-inline'`.

---

### 2. Nonce entropy: 122 bits, just under the conventional ≥128 bit recommendation

**Severity:** Low
**Location:** `proxy.ts:37`
**Move:** #9 (cryptographic choices)
**Confidence:** High

`Buffer.from(crypto.randomUUID()).toString("base64")` base64-encodes the
**string representation** of a UUID v4 (36 ASCII characters including
dashes), producing a 48-character base64 token. The underlying entropy is
the UUIDv4 itself: 122 bits of CSPRNG-sourced randomness (six bits are
fixed for version/variant). The W3C CSP spec recommends "at least 128 bits
of entropy" and OWASP recommends the same for nonces.

122 bits is in practice unbreakable for the lifetime of a single HTTP
response, so this is not exploitable today. It is a defense-in-depth gap
against future cryptanalysis or against a misconfigured server that
inadvertently reuses nonces under load.

**Recommendation:** Use `crypto.getRandomValues(new Uint8Array(16))` and
base64-encode the bytes. This is also semantically clearer ("16 random
bytes") than base64-encoding the textual form of a UUID, and yields a
shorter token (24 chars) carrying a full 128 bits:

```ts
const bytes = new Uint8Array(16);
crypto.getRandomValues(bytes);
const nonce = Buffer.from(bytes).toString("base64");
```

---

### 3. `connect-src 'self'` will break PNG graph export (`fetch(dataUrl)` with a `data:` URL)

**Severity:** Medium
**Location:** Caused by `proxy.ts:26`; trips at `app/lib/utils/exportGraph.ts:24` and `:37`
**Move:** #2 (implicit assumption — that browser fetches only target same-origin)
**Confidence:** High

`exportGraph.ts` calls `await fetch(dataUrl)` where `dataUrl` is the
`data:image/png;base64,...` produced by `html-to-image`'s `toPng`. CSP's
`connect-src` directive governs `fetch()`, and `'self'` does **not** allow
`data:` schemes. This will throw a CSP violation in the browser at the
moment a user tries to export the graph as PNG (used by both
`downloadGraphAsPng` and `graphToPngBlob`, the latter of which feeds the
zip export path).

This is a functional regression introduced by this branch, not a
pre-existing security flaw. The fix is straightforward.

**Recommendation:** Either (a) add `data:` to `connect-src` (mildly
weakening — `data:` connect lets exfil-style XSS payloads call `fetch` on
arbitrary embedded payloads, but CSP already blocks the exec side), or
(b) — strongly preferred — refactor `exportGraph.ts` to skip the `fetch`
round-trip and decode the data URL directly (the data URL is generated
locally; fetching it is gratuitous). Sketch:

```ts
const dataUrl = await toPng(viewportElement, ...);
const base64 = dataUrl.split(",", 2)[1];
const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
const blob = new Blob([bytes], { type: "image/png" });
```

Verify with the graph PNG export action and the workspace zip export.

---

### 4. `form-action` is not set; spec says it does NOT fall back to `default-src`

**Severity:** Low
**Location:** `proxy.ts:20-30`
**Move:** #5 (invert the access-control model — what does this *not* prevent?)
**Confidence:** Medium

The CSP spec explicitly lists `form-action` as a directive that does **not**
inherit from `default-src`. Some browsers (Chrome) historically did fall it
back, but per CSP3 it is unrestricted by default. The app does not appear
to have user-visible `<form action="...">` elements that POST off-origin
today, but a future addition (or an injected form via XSS that bypasses
script execution but not DOM injection — e.g., a markdown sanitizer hole
emitting `<form action="https://evil/">`) would be free to submit form
data anywhere.

**Recommendation:** Add `"form-action 'self'"` to the directive list. Zero
runtime cost.

---

### 5. `worker-src` not set explicitly (PDF.js worker relies on `default-src 'self'` fallback)

**Severity:** Informational
**Location:** `proxy.ts:20-30`; related code at `app/lib/utils/fileExtraction.ts:26` and `app/lib/utils/pdfPropositionParser.ts:443`
**Move:** #1 (trust boundaries)
**Confidence:** High

The PDF parser sets `pdfjsLib.GlobalWorkerOptions.workerSrc = new
URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()`,
which resolves to a same-origin URL via the bundler. CSP's `worker-src`
falls back to `child-src` and then `script-src` (per CSP3); since
`script-src` here uses nonces + `'strict-dynamic'`, behavior is
browser-dependent. In practice modern Chromium/Firefox treat
`'strict-dynamic'` as covering script-loaded workers. This works today, but
relying on the fallback chain across browsers is fragile.

**Recommendation:** Add `"worker-src 'self' blob:"` explicitly. (`blob:` is
needed if `pdfjs-dist` ever falls back to its `?url` blob-worker path,
which is the documented bundler-agnostic mode.) Test PDF upload after the
change.

---

### 6. `'self'` in `script-src` is shadowed by `'strict-dynamic'`

**Severity:** Informational
**Location:** `proxy.ts:22`
**Move:** #5 (invert — what is each token actually doing?)
**Confidence:** High

Per CSP3, when `'strict-dynamic'` is present in `script-src`, host-source
and `'self'` keywords are **ignored** by browsers that support
`'strict-dynamic'` (essentially everything modern). Only the nonce/hash
sources remain effective. Including `'self'` is therefore a no-op in
modern browsers and a "fallback for legacy browsers" only — but if a
legacy browser (no `'strict-dynamic'` support) lands on the page, it will
ignore `'strict-dynamic'` and accept any `'self'` script, which defeats
the integrity model. This is a known deliberate tradeoff in the CSP3 design
and is not exploitable on any current browser; flagging for awareness.

**Recommendation:** No change required. If you want to be explicit about
intent, leave `'self'` in (it documents the legacy fallback) and add a
comment. No harm either way.

---

### 7. Companion security headers not set (acknowledged out of scope)

**Severity:** Informational
**Location:** `proxy.ts:44-48`
**Move:** #1 (trust boundaries — what other browser-enforced controls are missing?)
**Confidence:** High

The user noted these may be out of scope for a CSP-only branch. Listing for
completeness so they are not forgotten:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff` (prevents MIME sniffing — the
  authoritative defense alongside CSP for type-confusion attacks)
- `Referrer-Policy: strict-origin-when-cross-origin` (or `same-origin`)
- `Permissions-Policy` to disable unused APIs (`geolocation`, `camera`,
  `microphone`, `payment`, `usb`, etc.)

`X-Frame-Options` is **superseded** by `frame-ancestors 'none'` which is
already set, so that one is genuinely covered.

**Recommendation:** Track in a follow-up PR. None of these change the CSP
review's conclusion; they are additive defense-in-depth.

---

### 8. Comment in `proxy.ts` claims Edge runtime; Next 16 proxy defaults to Node.js

**Severity:** Informational
**Location:** `proxy.ts:35-36`
**Move:** N/A — informational, surfaced by the provided fact-check
**Confidence:** High (per the fact-check report)

The fact-check found that Next 16's renamed proxy defaults to the Node.js
runtime, not Edge. This does not affect security: `Buffer` and
`crypto.randomUUID()` exist in both runtimes. It does affect future
maintenance — someone reading the comment may infer that switching runtimes
will break the file when in fact it would not.

**Recommendation:** Update the comment to drop the "Edge runtime" claim.
Phrase it as "available in both Node and Edge runtimes" or simply remove
the runtime reference.

---

### 9. `app/layout.tsx` comment description of nonce propagation is slightly off

**Severity:** Informational
**Location:** `app/layout.tsx:27-30`
**Move:** N/A — informational, related to fact-check
**Confidence:** High

The comment says "Next.js automatically tags its own bootstrap `<script>`
elements with the nonce from the response's CSP header." Mechanically, Next
reads the nonce from the **`x-nonce` request header** that this proxy sets
on the forwarded request — not by parsing it back out of the response CSP
header. The proxy correctly forwards `x-nonce`; the layout correctly opts
into dynamic rendering with `await headers()`; this is wired up properly.
Only the explanatory comment is misleading.

**Recommendation:** Reword to: "Next.js reads the nonce from the `x-nonce`
request header (set by `proxy.ts`) and applies it to its own bootstrap
scripts when the layout renders dynamically."

---

## What Looks Good

- **Nonce + `'strict-dynamic'`** is the modern recommended pattern (per
  Google's CSP guide) and is correctly applied here. This is materially
  stronger than allowlist-based CSPs, which are routinely bypassable via
  JSONP or open redirects on whitelisted hosts.
- **`object-src 'none'`** — correct; blocks Flash/Java/`<embed>` legacy
  exploit surface.
- **`frame-ancestors 'none'`** — correctly chosen and supersedes
  `X-Frame-Options`. Clickjacking protection is in place.
- **`base-uri 'self'`** — correct; prevents `<base href>` injection from
  redirecting relative-URL script loads to attacker domains. This is a
  commonly-missed directive.
- **`default-src 'self'`** — correct fallback baseline.
- **CSPRNG source**: `crypto.randomUUID()` is CSPRNG-backed in both Node and
  Edge runtimes (not `Math.random()`). Good.
- **Per-request nonce** with no caching/reuse — correct lifecycle. The
  `await headers()` opt-out of static rendering is necessary for nonces to
  be per-request rather than per-build, and is correctly applied.
- **Matcher excludes prefetches** via the `missing` clause on
  `next-router-prefetch` and `purpose: prefetch`. App Router prefetches are
  RSC payloads (data, not HTML) so this is safe — full navigations always
  hit the proxy and get a CSP. Worth noting for future reviewers but not a
  bug.
- **No `dangerouslySetInnerHTML`, no `eval`, no `new Function`** in the app
  code; the CSP is tightening a surface that is already not actively
  exploited, which is the right time to add it.
- **No off-origin browser fetches**: all browser `fetch()` calls target
  `/api/*` (same origin). LLM provider calls are server-to-server. The
  `connect-src 'self'` directive correctly reflects the application's
  actual data-flow shape.

---

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 3 | `connect-src 'self'` breaks `fetch(dataUrl)` in graph PNG export | Medium | `app/lib/utils/exportGraph.ts:24,37` (caused by `proxy.ts:26`) | High |
| 1 | `style-src 'unsafe-inline'` real cause is React `style={{...}}`, not Tailwind | Low | `proxy.ts:23` | High |
| 2 | Nonce is 122 bits (UUID base64), under conventional ≥128 bit guideline | Low | `proxy.ts:37` | High |
| 4 | `form-action` not set; spec does not fall back to `default-src` | Low | `proxy.ts:20-30` | Medium |
| 5 | `worker-src` not set explicitly (PDF.js worker uses fallback chain) | Informational | `proxy.ts:20-30` | High |
| 6 | `'self'` in `script-src` is shadowed by `'strict-dynamic'` | Informational | `proxy.ts:22` | High |
| 7 | Companion headers (HSTS, nosniff, Referrer-Policy, Permissions-Policy) absent | Informational | `proxy.ts:44-48` | High |
| 8 | Comment claims Edge runtime; Next 16 proxy defaults to Node.js | Informational | `proxy.ts:35-36` | High |
| 9 | `layout.tsx` comment misdescribes nonce propagation mechanism | Informational | `app/layout.tsx:27-30` | High |

---

## Overall Assessment

The CSP design is **well-architected**: nonce + `'strict-dynamic'` is the
state-of-the-art baseline, the directive set is appropriately strict for
the application's actual data-flow shape (no third-party browser fetches,
no off-origin embeds, no inline scripts), and the proxy correctly handles
per-request nonce generation and propagation. There are no critical or
high-severity findings, and there is no design flaw requiring rework.

The single most important thing to address before merge is **finding #3**:
PNG graph export will break under `connect-src 'self'` because
`exportGraph.ts` performs `fetch(dataUrl)` on a `data:` URL. Refactor that
helper to construct the `Blob` directly from the base64 payload (preferred)
or relax `connect-src` to permit `data:`. This is a regression introduced
by the branch and should be caught before users hit it.

The remaining findings are mostly comment/documentation accuracy
(`style-src` rationale, runtime claim, layout comment) and defense-in-depth
hardening (`form-action`, explicit `worker-src`, 128-bit nonce).
None block merge; all are quick follow-ups.
