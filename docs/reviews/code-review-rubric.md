# Code Review Rubric

**Scope:** `feat/graph-persistence-editing` vs `feat/zustand-wire-page` (PR #109, 87 files, +6376/-1827) | **Reviewed:** 2026-04-03 (Loop 2) | **Status: ✅ PASSES REVIEW**

---

## 🔴 Must Fix

Issues that must be resolved before merge. Draft cannot pass review with any red items unresolved.

| # | Finding | Domain | Location | Status |
|---|---|---|---|---|
| — | No red items | — | — | — |

---

## 🟡 Must Address

Issues that must be fixed or acknowledged by the author with justification for why they stand. Each must carry a resolution or author note.

| # | Finding | Domain | Source | Status | Author note |
|---|---|---|---|---|---|
| A1 | `addGraphEdge` reads `state.nodes` from closure instead of `setState` updater — stale state risk for cycle detection on rapid successive calls | Correctness / API consistency | Security + Performance + API Consistency + Tech Debt (4-way convergence, escalated from 🟢) | ✅ Fixed | Uses `nodesRef` pattern; verified by all 3 core critics in Loop 2 |
| A2 | Streaming path in `handleArtifactRoute` calls `streamLlm()` without `responseFormat`, bypassing JSON schema constraint that non-streaming path enforces | API Consistency | API Consistency | ✅ Acknowledged | Documented with comment explaining design tradeoff (streaming relies on system prompt for JSON shape; batch path uses responseFormat as extra safety net) |
| A3 | No request body size limits on API routes — potential for memory exhaustion via large POST bodies | Security | Security (pre-existing, carried over from prior review) | 🟡 Acknowledged | Pre-existing cross-cutting concern affecting all routes; not in scope for this graph-editing PR. Tracked for future middleware-level fix. |

---

## 🟢 Consider

Advisory findings from contextual critics, single-critic suggestions, and improvement opportunities. Not required to pass review.

| # | Finding | Source |
|---|---|---|
| C1 | `useGraphLayout` incremental positioning has zero tests — highest-risk untested new abstraction | Test Strategy |
| C2 | `coerceDecomposition` graphLayout validation untested — protects against corrupt persisted data | Test Strategy |
| C3 | Auto-save dirty check does full `structuredClone` + `JSON.stringify` every 5s even when nothing changed — a generation counter would make this O(1) | Performance |
| C4 | `useCausalGraphLayout` rebuilds all node/edge arrays on every streaming tick (~20/sec) even when graph structure hasn't changed | Performance |
| C5 | `addEdge` JSDoc documents 2 of 3 rejection conditions — missing "non-existent nodes" case | API Consistency / Fact-check |
| C6 | `wouldCreateCycle` comment reverses DFS direction description — logic correct, English misleading | Fact-check |
| C7 | `page.tsx` now 860 lines with 28-item dep array in `renderPanel` — continued growth of orchestrator | Tech Debt |
| C8 | `GraphPanel` at 17 props (7 new) — prop threading strain | Tech Debt |
| C9 | `streamLlm`/`callLlm` duplicate provider chain logic | Tech Debt |
| C10 | Two near-identical incremental Dagre layout hooks (`useCausalGraphLayout`, `useGraphLayout`) | Tech Debt |
| C11 | Incomplete dialectical-map → balanced-perspectives rename (string literals in onboarding + API prompt) | Tech Debt |
| C12 | Dead `useAllArtifactEditing` export (~45 lines) | Tech Debt |
| C13 | Dead `saveWorkspace` function (replaced by Zustand persistence) | API Consistency / Tech Debt |
| C14 | `docs/decisions/006-zustand-state-management.md` heading says "005" instead of "006" | Fact-check |
| C15 | `docs/decisions/005-streaming-api-responses.md` claims wait-time code "can be removed" but it's still used in 11 files | Fact-check |
| C16 | Full artifact JSON sent to DeepSeek for section edits — implicit data flow to third-party provider | Security |
| C17 | LLM response content (up to 500 chars) leaked in 502 error responses | Security |
| C18 | `data/analytics.jsonl` committed to branch history | Security |
| C19 | Lean route lacks input validation (pre-existing, widened by streaming addition) | API Consistency |

---

## ✅ Confirmed Good

Patterns, implementations, or claims confirmed correct by fact-check and/or critics.

| Item | Verdict | Source |
|---|---|---|
| Pure graph operations in `graphOperations.ts` — immutable, testable, with cycle detection | ✅ Confirmed | Fact-check + Security + API Consistency |
| Incremental Dagre layout — only new nodes trigger re-layout | ✅ Confirmed | Fact-check + Performance |
| Debounced viewport persistence (300ms) avoids excessive writes | ✅ Confirmed | Performance |
| `coerceDecomposition` graphLayout validation follows established patterns | ✅ Confirmed | Security |
| Zustand persist middleware with SSR safety (`skipHydration: true`) | ✅ Confirmed | Fact-check (5 verified claims) |
| Throttle utility trailing-edge delivery works correctly | ✅ Confirmed | Fact-check + Performance (prior false positive corrected) |
| `partialize` excludes action functions from persistence | ✅ Confirmed | Fact-check |
| Verification status sanitized on persistence to prevent stuck loading state | ✅ Confirmed | Fact-check |
| All dependency upgrades are safe patch/minor bumps | ✅ Confirmed | Dependency Upgrade |

---

To pass review: all 🔴 items must be resolved. All 🟡 items must be either fixed or carry an author note. 🟢 items are optional.
