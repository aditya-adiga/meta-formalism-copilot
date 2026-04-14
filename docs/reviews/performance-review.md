# Performance Re-Review (Loop 2): F1 Fix Verification

**Branch:** `feat/graph-persistence-editing`
**Base:** `feat/zustand-wire-page`
**Scope:** `git diff HEAD~1` (commit `2b30659`)
**Date:** 2026-04-03

## F1 Re-check: `addGraphEdge` stale closure and callback churn

**Status: FIXED**

The fix replaces the `[state.nodes]` dependency with a `nodesRef` pattern:

```typescript
const nodesRef = useRef(state.nodes);
nodesRef.current = state.nodes;  // updated every render

const addGraphEdge = useCallback((fromId: string, toId: string): boolean => {
  const result = addEdgeOp(nodesRef.current, fromId, toId);
  // ...
}, []);  // stable identity -- never recreated
```

**Verification:**

1. **Callback stability:** `addGraphEdge` now has `[]` deps, so it is created once and never recreated. This eliminates the callback churn that propagated through downstream consumers on every `state.nodes` change. Confirmed fixed.

2. **Fresh state access:** `nodesRef.current = state.nodes` is assigned directly in the render body (line 30), so it always reflects the latest rendered state when `addGraphEdge` is called. This is the standard React ref-sync pattern. Confirmed correct.

3. **Rapid-succession edge adds:** If two edges are added before a re-render, the second `addEdgeOp` call reads `nodesRef.current` which still holds the pre-first-add nodes array. The first add's `setState` updater has not yet run, so `nodesRef.current` is stale for the second call. This is the same race condition as before, but the comment (line 153) correctly documents it, and the scenario requires two programmatic edge adds in the same event loop tick -- not reachable from user interaction. Acceptable.

4. **Consistency with `removeGraphEdge`:** `removeGraphEdge` (line 162-164) uses the `setState` updater pattern (`prev.nodes`), which is the gold standard for avoiding stale state. `addGraphEdge` cannot use this pattern because it needs a synchronous boolean return for cycle-check feedback. The ref approach is the correct alternative. No inconsistency issue.

5. **Comment/docstring updates:** The JSDoc on `addGraphEdge` (line 150) and `addEdge` in `graphOperations.ts` (lines 124-128) were updated to reflect the full set of rejection conditions (cycle, duplicate, missing node). Accurate.

## New issues in this diff

### N1. `addGraphEdge` setState updater captures stale `result`

**Severity:** Low (edge case, not reachable from UI)
**Location:** `app/hooks/useDecomposition.ts:155-156`

When `addGraphEdge` succeeds, it calls `setState((prev) => ({ ...prev, nodes: result }))`. The `result` here is computed from `nodesRef.current` (the pre-call snapshot), not from `prev`. If another state update has already been enqueued (e.g., a node rename in the same batch), this updater overwrites `prev.nodes` with a stale-derived array, losing the rename.

The updater pattern would ideally re-derive the result from `prev.nodes`, but that would require calling `addEdgeOp` again inside the updater, which could give a different answer than the one returned to the caller. This is an inherent tension in the "synchronous return + async state update" design, and the current approach is the pragmatic choice. No action needed unless concurrent node mutations become a real usage pattern.

### No other new issues

The remaining changes in this commit are documentation-only (comment improvements in `graphOperations.ts` and `artifactRoute.ts`, plus review file updates). No performance impact.

## Summary

| Finding | Status | Notes |
|---------|--------|-------|
| F1 (Medium): `addGraphEdge` callback churn + stale closure | **Fixed** | `nodesRef` pattern eliminates `[state.nodes]` dep; callback is now stable |
| N1 (Low): `setState` updater uses pre-computed `result` | **Accepted** | Inherent tradeoff for synchronous return value; not reachable from UI |
| F2-F9 from Loop 1 | **Unchanged** | Not in scope of this diff |

The fix is correct and addresses both the performance issue (callback recreation) and the staleness risk (ref always current at call time). The one remaining edge case (N1) is a known limitation of the synchronous-return design and does not warrant further changes.
