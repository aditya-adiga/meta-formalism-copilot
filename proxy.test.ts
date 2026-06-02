import { describe, it, expect } from "vitest";
import { buildCsp } from "./proxy";

// Pin the CSP directive list so a refactor that weakens script-src,
// connect-src, frame-ancestors, or object-src fails loudly in tests rather
// than silently shipping. CSP changes are intentional security decisions —
// updating this test is the explicit acknowledgement.
describe("buildCsp", () => {
  const NONCE = "test-nonce-abc123";
  // Pin the production CSP explicitly so these assertions don't depend on the
  // ambient NODE_ENV the test runner happens to set.
  const csp = buildCsp(NONCE, false);
  const directives = csp.split("; ");

  it("interpolates the nonce into script-src", () => {
    expect(directives).toContain(
      `script-src 'self' 'nonce-${NONCE}' 'strict-dynamic'`,
    );
  });

  it("locks down the highest-risk directives", () => {
    expect(directives).toContain("default-src 'self'");
    expect(directives).toContain("connect-src 'self'");
    expect(directives).toContain("frame-ancestors 'none'");
    expect(directives).toContain("object-src 'none'");
    expect(directives).toContain("base-uri 'self'");
    expect(directives).toContain("form-action 'self'");
  });

  it("does not allow eval, wildcards, or http: schemes in production", () => {
    expect(csp).not.toMatch(/'unsafe-eval'/);
    expect(csp).not.toMatch(/\*\s/); // wildcard source not followed by directive end
    expect(csp).not.toMatch(/\bhttp:\b/);
  });

  it("allows 'unsafe-eval' only in development (for Next.js dev HMR/eval source maps)", () => {
    const devCsp = buildCsp(NONCE, true);
    const devScriptSrc = devCsp
      .split("; ")
      .find((d) => d.startsWith("script-src"));
    expect(devScriptSrc).toBe(
      `script-src 'self' 'nonce-${NONCE}' 'strict-dynamic' 'unsafe-eval'`,
    );
    // 'unsafe-eval' must remain scoped to script-src — never leaks elsewhere.
    expect(devCsp.match(/'unsafe-eval'/g)).toHaveLength(1);
  });

  it("emits the directive list in stable order", () => {
    expect(directives.map(d => d.split(" ")[0])).toEqual([
      "default-src",
      "script-src",
      "style-src",
      "img-src",
      "font-src",
      "connect-src",
      "frame-ancestors",
      "base-uri",
      "object-src",
      "form-action",
    ]);
  });
});
