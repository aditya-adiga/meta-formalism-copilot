# 001: Use Vitest as the Test Framework

**Date:** 2025-02-24
**Status:** Accepted

## Context

The project needs a test framework. The two main candidates for a Next.js + TypeScript project are **Jest** and **Vitest**.

## Decision

Use **Vitest** with `jsdom` for unit/component testing and `@testing-library/react` for React component tests.

## Rationale

### Why Vitest over Jest

1. **Native ESM support.** This project uses `module: "esnext"` with `moduleResolution: "bundler"` in tsconfig. Vitest handles ESM natively via Vite's transform pipeline, while Jest requires the `--experimental-vm-modules` flag or additional transform configuration for ESM.

2. **Faster execution.** Vitest uses Vite's dev server and esbuild/SWC for transforms, giving significantly faster cold starts and test runs compared to Jest's Babel-based pipeline.

3. **Simpler configuration.** Vitest resolves TypeScript path aliases (`@/*`) via Vite's `resolve.alias` with minimal config. Jest requires a separate `moduleNameMapper` configuration or the `next/jest` helper.

4. **Jest-compatible API.** Vitest uses the same `describe`/`it`/`expect` API as Jest, so there's no learning curve and tests are portable if we ever need to switch.

5. **Active ecosystem alignment.** The rest of the toolchain (Next.js 16, React 19, Tailwind v4) is ESM-first and modern; Vitest fits naturally into this stack.

### Why not Jest

- Jest's ESM support is still experimental and requires workarounds for projects that use native ESM modules.
- `next/jest` provides configuration helpers, but adds boilerplate that Vitest doesn't need.
- Jest's transform pipeline (Babel or SWC via `@swc/jest`) adds configuration surface area.

## Packages

- `vitest` — test runner
- `jsdom` — browser environment simulation for component tests
- `@testing-library/react` — React component testing utilities
- `@testing-library/jest-dom` — custom matchers for DOM assertions (`.toBeInTheDocument()`, etc.)

## Consequences

- Test files use `*.test.ts` / `*.test.tsx` naming convention
- Tests live alongside source files (co-located), not in a separate `__tests__` directory
- `npm test` and `npm run test:ui` scripts are available
- Future integration/E2E testing (e.g., Playwright) is a separate decision
