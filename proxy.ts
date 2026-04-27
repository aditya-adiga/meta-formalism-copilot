import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * CSP proxy (Next.js 16 renamed Middleware → Proxy) with per-request nonces.
 *
 * Why nonces + 'strict-dynamic': only scripts that Next.js has explicitly
 * tagged with the nonce can run, and any scripts they load inherit trust.
 * This keeps a hypothetical injected `<script>` tag from executing even if
 * something slipped past markdown sanitization.
 *
 * Why `style-src 'unsafe-inline'`: Tailwind v4 emits inline styles. Tightening
 * to nonces would require rebuilding how Tailwind ships styles in dev and
 * SSR. Documented as a deliberate carve-out, not an oversight.
 *
 * `connect-src 'self'` is sufficient because Anthropic / OpenAlex / OpenRouter
 * calls are server-to-server (Next API routes), not browser-to-third-party.
 */
function buildCsp(nonce: string): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ];
  return directives.join("; ");
}

export function proxy(request: NextRequest) {
  // Generate a fresh nonce per request. crypto.randomUUID is available in the
  // Edge runtime that Next proxy runs in.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  // Forward the nonce to server components via a request header so layouts
  // can read it via `headers()` and pass it to <Script> tags they render.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Apply CSP to page navigations only. Skip API routes (they don't render
  // HTML), Next's static assets (no scripts to nonce), and prefetches (which
  // would otherwise burn a nonce on a request that may never paint).
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
