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
 * Why `style-src 'unsafe-inline'`: many React components use inline
 * `style={{...}}` props (e.g. proof-graph node positioning, refinement
 * preview, collapsible sections), and Next.js's SSR style injection also
 * emits inline <style> tags. Tightening to nonces would require auditing
 * every such site. Documented as a deliberate carve-out, not an oversight.
 *
 * `connect-src 'self'` is sufficient because Anthropic / OpenAlex / OpenRouter
 * calls are server-to-server (Next API routes), not browser-to-third-party.
 *
 * Why `allowUnsafeEval` in development only: Next.js's dev server (HMR + eval
 * source maps) injects `eval()`-based code that a strict CSP blocks, flooding
 * the browser console with EvalErrors. Production output is genuinely
 * eval-free, so `'unsafe-eval'` is added only when NODE_ENV !== "production".
 */
export function buildCsp(
  nonce: string,
  allowUnsafeEval: boolean = process.env.NODE_ENV !== "production",
): string {
  const scriptSrc = `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
    allowUnsafeEval ? " 'unsafe-eval'" : ""
  }`;
  const directives = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    // form-action does NOT fall back to default-src (CSP3); set explicitly.
    "form-action 'self'",
  ];
  return directives.join("; ");
}

export function proxy(request: NextRequest): NextResponse {
  // Generate a fresh 128-bit nonce per request. crypto.getRandomValues + Buffer
  // are both available in the Node.js runtime Next 16 Proxy runs on by default.
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const csp = buildCsp(nonce);

  // Forward the nonce to server components via a request header so layouts
  // can read it via `headers()` and pass it to <Script> tags they render.
  // Setting CSP on both the forwarded request and the response matches the
  // canonical Next.js docs example.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

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
