import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Lean verifier is a separate Node.js project compiled by its own tsconfig.
    // Its compiled dist/ output uses CommonJS require() which would fail this lint.
    "verifier/**",
  ]),
  // Provide the React version explicitly so eslint-plugin-react does not try to
  // auto-detect it via context.getFilename(), which is not available in ESLint v9+
  // flat config and would otherwise cause a crash.
  {
    settings: {
      react: {
        version: "19",
      },
    },
  },
  // Defense-in-depth lint rules. The XSS surface is already defensive (no
  // dangerouslySetInnerHTML, no rehype-raw, KaTeX trust:false). These rules
  // are guardrails that fail loudly if a future change tries to weaken any
  // of those — cheaper than catching it in code review every time.
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "rehype-raw",
              message: "rehype-raw lets raw HTML in markdown render as live DOM, which defeats sanitization on LLM output. If you genuinely need it, write an ADR and disable this rule explicitly.",
            },
          ],
        },
      ],
      // Catches `trust: true` on object literals — most common in
      // rehype-katex's options where it re-enables active links and HTML in
      // math, defeating KaTeX's default-safe rendering. Broad enough to
      // catch `{ trust: true }` elsewhere too; that's intended.
      // Known gaps (ESLint AST limitations): does NOT catch the string-quoted
      // form `{ "trust": true }`, the shorthand form `{ trust }` where `trust`
      // is bound to `true`, or computed keys. Treat the rule as best-effort
      // tripwire, not a hard guarantee — code review still matters here.
      "no-restricted-syntax": [
        "error",
        {
          selector: "Property[key.name='trust'][value.value=true]",
          message: "trust: true on KaTeX/rehype-katex (or anywhere similar) re-enables active links and raw HTML in math output. If you genuinely need it, write an ADR and disable this rule explicitly.",
        },
      ],
      // Currently zero usages — keep it that way. `error` (not `warn`) so a
      // future PR introducing `dangerouslySetInnerHTML` fails CI rather than
      // logging a warning that nobody reads.
      "react/no-danger": "error",
    },
  },
]);

export default eslintConfig;
