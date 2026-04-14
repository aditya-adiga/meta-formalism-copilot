# Code Fact-Check Report (Loop 2 Re-check)

**Repository:** meta-formalism-copilot
**Scope:** Fix commit on `feat/graph-persistence-editing` relative to `feat/zustand-wire-page`
**Checked:** 2026-04-03
**Prior findings re-checked:** 5
**New claims introduced by fixes:** 2

---

## Re-check Results

### Finding 1 (Claim 8): Decision doc heading "005" vs "006"
**Verdict:** Fix verified.
Heading in `docs/decisions/006-zustand-state-management.md` now reads `# 006: Zustand for State Management`, matching the filename.

### Finding 2 (Claim 13): `wouldCreateCycle` JSDoc direction
**Verdict:** Fix verified, but inline comment introduces a new inaccuracy.
The JSDoc (lines 16-19) now correctly states: "Uses DFS from `fromId` following dependsOn chains to check if `fromId` can already reach `toId`." This matches the code: `canReach(fromId, toId)` starts at `fromId` and traverses `dependsOn` edges.

**New issue:** The inline comment at line 29 reads: "A cycle exists if fromId is already reachable from toId via dependsOn." This is backwards. It should read: "A cycle exists if **toId** is already reachable from **fromId** via dependsOn." The JSDoc is correct; only this interior comment has the direction reversed.

**Evidence:** `app/lib/utils/graphOperations.ts:29` vs `app/lib/utils/graphOperations.ts:47` (`canReach(fromId, toId)`)

### Finding 3 (Claim 14): `addEdge` JSDoc missing third null-return condition
**Verdict:** Fix verified.
JSDoc now reads: "Returns null if either node doesn't exist, the edge already exists, or the edge would create a cycle." All three conditions documented, matching the code at lines 134-143.

### Finding 4 (New): `nodesRef` comment in `useDecomposition.ts`
**Verdict:** Verified.
The comment at lines 27-28 says the ref "tracks latest nodes so addGraphEdge can read fresh state synchronously without depending on state.nodes in its useCallback deps (which caused stale closures)." This is accurate: the old code had `[state.nodes]` in the deps array and used `state.nodes` directly; the new code uses `nodesRef.current` with `[]` deps, avoiding stale closures from the useCallback dependency capture.

### Finding 5 (New): Streaming responseFormat comment in `artifactRoute.ts`
**Verdict:** Verified.
The comment at lines 70-73 says streaming does not pass `responseFormat` because provider streaming APIs don't support it consistently. Confirmed: `streamLlm`'s `StreamLlmOptions` type (`app/lib/llm/streamLlm.ts:25-36`) has no `responseFormat` parameter, while `callLlm` does accept it and passes it through. The batch path at line 92 does pass `config.responseFormat`.

---

## Summary

4 of 5 findings fully verified. One new issue found:

| Location | Issue | Severity |
|---|---|---|
| `app/lib/utils/graphOperations.ts:29` | Inline comment reverses fromId/toId reachability direction | Low (JSDoc is correct; only the interior comment is wrong) |
