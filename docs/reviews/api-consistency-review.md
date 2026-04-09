# API Consistency Review: feat/graph-persistence-editing (Loop 2)

**Reviewer:** Claude (API Consistency)
**Branch:** `feat/graph-persistence-editing` relative to `feat/zustand-wire-page`
**Date:** 2026-04-03
**Scope:** Re-review of fix commit `2b30659` addressing Loop 1 findings A1/F2, F1, A2/F3.

---

## Re-check: Prior Findings

### F1 (Minor) -- `addEdge` JSDoc incomplete -- RESOLVED

JSDoc at `graphOperations.ts:124-128` now reads: "Returns null if either node doesn't exist, the edge already exists, or the edge would create a cycle." All three code paths are documented. The `wouldCreateCycle` JSDoc (lines 16-19) was also corrected to accurately describe the DFS direction.

### F2 (Inconsistent) -- `addGraphEdge` stale closure -- RESOLVED with caveat

The fix uses a `nodesRef` pattern (lines 27-30): the ref is updated on every render to track `state.nodes`, and `addGraphEdge` reads from `nodesRef.current` instead of the closure-captured `state.nodes`. The deps array is now empty, which is correct since the ref is stable.

**Caveat (known limitation, not a blocker):** If two `addGraphEdge` calls execute before a re-render, the second call reads `nodesRef.current` which still holds the pre-first-call value (the ref only updates on render). The second call's `setState` would overwrite the first call's edge. This is the same class of problem as before but narrower -- it requires two calls in the same synchronous tick rather than just the same render cycle. The original review's recommended fix (using the setState updater with a local `success` flag) would fully eliminate this. However, the current fix is a meaningful improvement and the rapid-succession scenario is unlikely in practice (edge additions are user-initiated clicks).

**Verdict:** Acceptable. The remaining edge case is documented by the comment and unlikely to trigger.

### F3 (Inconsistent) -- Streaming drops `responseFormat` -- RESOLVED

Comment at `artifactRoute.ts:70-73` now documents the design tradeoff: streaming skips `responseFormat` because provider streaming APIs don't support it consistently, and the system prompt is relied upon for correct JSON shape. The batch path enforces the schema as a safety net. This is option (b) from the original recommendation ("document that streaming intentionally skips schema enforcement").

---

## New Issues

No new issues found in the fix commit. The changes are minimal and scoped to the three findings.

---

## Carry-forward from Loop 1 (not addressed in this fix, still applicable)

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| F4 | `edit/artifact` uses `content` instead of `fullText` | Minor | Open |
| F5 | `saveWorkspace` is dead code | Minor | Open |
| F6 | Lean route lacks input validation | Minor | Open |
| F7 | Duplicated `recordAndCache` in `streamLlm` vs `callLlm` | Informational | Open |

---

## Verdict

All three targeted findings are resolved. No new issues introduced. The F2 fix has a narrow remaining edge case (two calls in the same synchronous tick) that is documented and unlikely in practice. **Approve** -- no further changes needed for this pass. F4-F7 remain open for a follow-up.
