# Partial JSON Streaming for Graph Views

Status: implementation complete

## Problem

JSON artifact types (causal-graph, statistical-model, property-tests, dialectical-map) currently
use batch `callLlm()` wrapped in a single SSE `done` event (`artifactRoute.ts:86`). Users see
nothing during 15-85s of generation. Phase 1 streaming (raw token preview) exists for text
artifacts but not JSON ones. Phase 2 (decision 005) calls for progressive rendering of the
actual visualization as tokens arrive.

## Approach

### Library: `partial-json`

- `parse(incompleteString)` → best-effort JS object from truncated JSON
- ~2KB, zero deps, simplest API of the options evaluated
- Alternatives considered: `parse-json-stream` (event-based), `llm-json-stream` (async iterable)
- `partial-json` maps directly to the existing `onToken(accumulated)` callback pattern

### Server change (~5 lines in `artifactRoute.ts`)

Remove the `handleBatchAsSSE` path for JSON artifacts. Use `streamLlm()` directly — same path
text artifacts already use. The `done` event still carries full accumulated text for final parsing.

```
// Before: JSON artifacts → handleBatchAsSSE (batch call, single done event)
// After:  JSON artifacts → streamLlm() (real token streaming + done event)
```

### Client change (`useArtifactGeneration.ts`)

Switch JSON artifact generation from `fetch()` + `res.json()` to `fetchStreamingApi()`.
In the `onToken` callback, run `partial-json`'s `parse()` on accumulated text, throttled at 50ms.
Store partial result in `streamingPreview` state (already exists, currently semiformal-only).

### Layout refactor: incremental positioning (`useCausalGraphLayout`)

**Critical design constraint:** graph views will later support user interaction (drag nodes,
add/remove nodes and edges, collapse subgraphs). Full Dagre re-layout on every streaming update
is incompatible with this — it would blow away user-positioned nodes.

Current architecture (pure derived state):
```
causalGraph data → useMemo → Dagre layout → { nodes, edges }
```

New architecture (incremental state):
```
causalGraph data (streaming in)
  → diff against known nodes/edges
  → NEW items: Dagre-position relative to existing graph, add to state
  → EXISTING items: update data (label, description) but preserve position
  → REMOVED items (user action): stay removed, tracked in a "deleted" set

user interactions (drag, delete, collapse) — future
  → mutate graph state directly
  → streaming updates respect these modifications
```

Implementation: change `useCausalGraphLayout` from `useMemo` to `useReducer` or `useState`
with an update function. Dagre runs once for initial placement; new nodes get positioned
incrementally. Position state is sovereign and never overwritten by data updates.

This naturally supports both streaming and future editing without a rewrite later.

### Component changes

`useCausalGraphLayout` already handles `null` and empty arrays. Needs one small fix:
treat `undefined` arrays (from partial parse) as empty rather than erroring.

ReactFlow's `onNodesChange` already tracks positions — the incremental layout approach
aligns with how ReactFlow wants to work.

## Implementation order

1. ~~`npm install partial-json`~~ done
2. ~~Server: enable token streaming for JSON artifacts (remove `handleBatchAsSSE` path)~~ done
3. ~~Client: extend `fetchStreamingApi` or add helper for partial JSON callbacks~~ done
4. ~~`useArtifactGeneration`: wire up streaming for JSON types with throttled partial updates~~ done
5. ~~Refactor `useCausalGraphLayout` from pure `useMemo` to incremental state~~ done
6. ~~`CausalGraphView`: render partial graph data during streaming~~ done
7. ~~Repeat partial rendering for other JSON panels~~ done (statistical-model, property-tests, dialectical-map)

## Risks & open questions

- **JSON schema enforcement in streaming mode**: Anthropic SDK may not support
  `response_format: { type: "json_object" }` with streaming. Prompt-based approach
  should still work since it already does.
- **Caching**: `streamLlm` already has caching logic. Partial results should not be cached.
- **Error recovery**: if partial JSON parse fails mid-stream, fall back to raw text preview
  (Phase 1 behavior) rather than crashing.
- **Throttling**: parsing partial JSON on every token could be expensive. Existing `throttle()`
  utility at 50ms should suffice.
- **Layout stability during streaming**: even with incremental positioning, adding edges may
  cause visual shifts. Acceptable for initial implementation; can add CSS transitions later.

## What the LLM emits in order (causal graph)

```json
{ "variables": [          ← nodes appear one by one
    { "id": "v1", "label": "...", "description": "..." },
    ...
  ],
  "edges": [              ← connections appear after all nodes
    { "from": "v1", "to": "v2", ... },
    ...
  ],
  "confounders": [...],   ← badges appear late
  "summary": "..."        ← last
}
```

This natural ordering means users see: empty canvas → nodes appearing → edges connecting
them → confounder badges → summary text. Compelling progressive feedback.
