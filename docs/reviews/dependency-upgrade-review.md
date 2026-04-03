# Dependency Upgrade Review: `feat/graph-persistence-editing`

Reviewed relative to `main` on 2026-04-03. Branch adds 2 new production dependencies and upgrades 10 existing dependencies (6 production, 4 dev).

---

## New Dependencies

---

## Dependency Evaluation: zustand (new) ^5.0.12

### Summary

| Aspect | Assessment |
|--------|-----------|
| **Recommendation** | Add the dependency |
| **Breaking change impact** | None (new dependency) |
| **Estimated effort** | Already implemented |
| **Risk** | Low |

### Motivation

Replaces ~20 `useState` calls in `page.tsx` with a centralized store using `persist` middleware. Decision documented in `docs/decisions/005-zustand-state-management.md`, validated via prior spike.

### Codebase Usage

- `app/lib/stores/workspaceStore.ts` — single store using `create`, `persist`, `createJSONStorage`

### Transitive Effects

- **Dual zustand versions in bundle:** ReactFlow 11.x depends on zustand ^4.4.1. npm nests `zustand@4.5.7` under `@reactflow/*` packages while top-level resolves to `zustand@5.0.12`. These are separate module instances with no shared state — safe.
- Bundle size increase is minimal (~3KB gzipped) since zustand v4 was already present as a transitive dep.

### Risk Factors

- Low. Zustand is mature (46k+ stars, ~40M weekly npm downloads). SSR handled correctly via `skipHydration: true` with explicit rehydration in `useEffect`.

---

## Dependency Evaluation: partial-json (new) ^0.1.7

### Summary

| Aspect | Assessment |
|--------|-----------|
| **Recommendation** | Add the dependency |
| **Breaking change impact** | None (new dependency) |
| **Estimated effort** | Already implemented |
| **Risk** | Low |

### Motivation

Enables progressive rendering of JSON artifact types (causal-graph, statistical-model, etc.) during LLM streaming. Previously users saw nothing during 15-85s of generation. Design documented in `docs/thoughts/partial-json-streaming.md`.

### Codebase Usage

- `app/hooks/useArtifactGeneration.ts` — `import { parse as parsePartialJson } from "partial-json"` — used to parse incomplete JSON from streaming tokens into best-effort JS objects for live preview.

### Transitive Effects

- Zero dependencies, ~2KB. No transitive concerns.

### Risk Factors

- Low. Small, focused library. Used only for display-time parsing of incomplete JSON; final artifact always parsed from complete JSON. Failure mode is graceful (preview doesn't update until enough valid JSON accumulates).

---

## Upgraded Dependencies (Production)

---

## Dependency Upgrade Evaluation: @anthropic-ai/sdk 0.79.0 -> 0.80.0

### Summary

| Aspect | Assessment |
|--------|-----------|
| **Recommendation** | Upgrade now |
| **Breaking change impact** | None |
| **Estimated effort** | 0 minutes (no code changes needed) |
| **Risk** | Low |

### Motivation

Patch-level bump within the 0.x series. Likely includes new model support and minor fixes. The SDK follows a rapid release cadence; staying within 1-2 versions of latest is reasonable.

### Breaking Changes That Affect This Project

None identified. The codebase uses the SDK conservatively:
- `new Anthropic({ apiKey })` constructor
- Standard `messages.create()` API calls
- No streaming helpers from the SDK (streaming is handled via custom SSE implementation)

### Codebase Usage

- `app/lib/llm/callLlm.ts` — sole import, creates client and calls `messages.create()`

### Transitive Effects

None significant. The SDK manages its own HTTP dependencies internally.

### Risk Factors

- Low. Minor version bump in a pre-1.0 SDK, but the surface area used is minimal and stable.

---

## Dependency Upgrade Evaluation: next 16.1.7 -> 16.2.1

### Summary

| Aspect | Assessment |
|--------|-----------|
| **Recommendation** | Upgrade now |
| **Breaking change impact** | None |
| **Estimated effort** | 0 minutes |
| **Risk** | Low |

### Motivation

No breaking changes between 16.1 and 16.2. Significant performance improvements: ~87% faster dev server startup, up to 350% faster Server Components payload deserialization, 67-100% faster HMR. Browser-style HMR for server code is now default.

### Breaking Changes That Affect This Project

None. [Next.js 16.2 blog post](https://nextjs.org/blog/next-16-2) confirms no breaking changes.

### Known Issues

- [Issue #91642](https://github.com/vercel/next.js/issues/91642): Build failure related to Turbopack and `fflate` module resolution. This project does **not** use Turbopack (no turbopack config found in the codebase), so this issue does not apply.

### Transitive Effects

- `eslint-config-next` should match the Next.js version (upgraded to ^16.2.1 in this branch — correct).

### Risk Factors

- Low. Performance-focused release with no API changes.

---

## Dependency Upgrade Evaluation: katex 0.16.37 -> 0.16.44

### Summary

| Aspect | Assessment |
|--------|-----------|
| **Recommendation** | Upgrade now |
| **Breaking change impact** | None |
| **Estimated effort** | 0 minutes |
| **Risk** | Low |

### Motivation

Patch bump within the 0.16.x series. KaTeX has had security vulnerabilities in older versions (loop condition bypass, protocol bypass, maxExpand bypass) that were fixed in 0.16.10+. Both 0.16.37 and 0.16.44 are post-fix versions, but staying current with patches is good hygiene for a library that renders user-provided LaTeX.

### Breaking Changes That Affect This Project

None. Patch release within the same minor version.

### Codebase Usage

- `app/components/features/output-editing/LatexRenderer.tsx` — used via `rehype-katex` for rendering LaTeX in markdown output

### Transitive Effects

None. KaTeX is a leaf dependency with no significant transitive tree.

### Risk Factors

- Low. Rendering-only changes in a patch bump.

---

## Dependency Upgrade Evaluation: pdfjs-dist 5.5.207 -> 5.6.205

### Summary

| Aspect | Assessment |
|--------|-----------|
| **Recommendation** | Upgrade now |
| **Breaking change impact** | None expected |
| **Estimated effort** | 0 minutes |
| **Risk** | Low |

### Motivation

Minor version bump. pdf.js follows Firefox's release schedule and includes incremental rendering and parsing improvements.

### Breaking Changes That Affect This Project

None identified. The codebase uses only basic APIs:
- `getDocument()` from legacy build (scripts only)
- `TextItem` and `TextStyle` type imports for PDF text extraction

### Codebase Usage

- `app/lib/utils/fileExtraction.ts` — type import only (`TextItem`)
- `app/lib/utils/pdfPropositionParser.ts` — type imports (`TextItem`, `TextStyle`)
- `scripts/diagnose-pdf.mjs` — `getDocument` from legacy build

### Transitive Effects

None significant.

### Risk Factors

- Low. The project uses only type imports from the main package and `getDocument` from the legacy build in a diagnostic script. The API surface consumed is extremely stable.

---

## Upgraded Dependencies (Dev)

---

## Dependency Upgrade Evaluation: @types/node 20.x -> 24.x

### Summary

| Aspect | Assessment |
|--------|-----------|
| **Recommendation** | Upgrade now |
| **Breaking change impact** | None in practice |
| **Estimated effort** | 0 minutes |
| **Risk** | Low |

### Motivation

The project runs on Node.js v22.20.0. `@types/node@24` corresponds to Node.js 24 types, which is a forward-looking choice. While there is a mismatch (runtime is v22, types are for v24), this is common practice and generally safe — Node 24 types are a superset. The jump from `@types/node@20` was overdue given the runtime is already v22.

### Breaking Changes That Affect This Project

Node 24 types add new APIs (e.g., updated `fetch` types from Undici 7.0.0) and deprecate some legacy APIs (`SlowBuffer`, `tls.createSecurePair`, old-style `fs` constants). None of these deprecated APIs are used in this codebase — the project's Node.js usage is limited to `crypto.randomUUID()` and standard module imports.

### Risk Factors

- Low. The types are slightly ahead of the runtime version, but this only means some types exist that aren't available at runtime. Since the project barely uses Node.js APIs directly (it's a Next.js app), this is a non-issue.

---

## Dependency Upgrade Evaluation: eslint 10.0.2 -> 10.1.0 / eslint-config-next 16.1.6 -> 16.2.1

### Summary

| Aspect | Assessment |
|--------|-----------|
| **Recommendation** | Upgrade now |
| **Breaking change impact** | None |
| **Estimated effort** | 0 minutes |
| **Risk** | Low |

### Motivation

Patch/minor bumps. `eslint-config-next` should track the Next.js version for compatibility.

### Risk Factors

- Low. These are dev-only tooling upgrades.

---

## Dependency Upgrade Evaluation: jsdom 29.0.0 -> 29.0.1

### Summary

| Aspect | Assessment |
|--------|-----------|
| **Recommendation** | Upgrade now |
| **Breaking change impact** | None |
| **Estimated effort** | 0 minutes |
| **Risk** | Low |

### Motivation

Patch bump. Bug fixes only.

---

## Dependency Upgrade Evaluation: vite 8.0.0 -> 8.0.3 / vitest 4.1.0 -> 4.1.2

### Summary

| Aspect | Assessment |
|--------|-----------|
| **Recommendation** | Upgrade now |
| **Breaking change impact** | None |
| **Estimated effort** | 0 minutes |
| **Risk** | Low |

### Motivation

Patch bumps for the build tool and test runner. Bug fixes and stability improvements.

---

## Overall Assessment

**All dependency changes are safe to merge.** The branch adds two well-justified new dependencies (zustand for state management, partial-json for streaming preview) and applies routine version bumps across production and dev dependencies. No breaking changes affect this project's usage patterns.

| Category | Count | Risk |
|----------|-------|------|
| New production deps | 2 (zustand, partial-json) | Low — both well-documented with decision records |
| Production upgrades | 4 (anthropic-sdk, next, katex, pdfjs-dist) | Low — all patch/minor bumps, no breaking changes |
| Dev upgrades | 5 (@types/node, eslint, eslint-config-next, jsdom, vite, vitest) | Low — tooling bumps only |

**No action items.** All changes can proceed as-is.
