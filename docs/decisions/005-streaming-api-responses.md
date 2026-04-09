# 005: Streaming API Responses

## Context

The app makes LLM calls that take 15-85 seconds. A wait-time estimation system was built (PR pending) using hardcoded regression priors, but the estimates were often 3x off (e.g., 25s predicted vs 75s actual for causal-graph). Rather than improving the prediction model, streaming solves the root cause by showing real progress.

## Decision

Replace batch LLM responses with streaming across all API routes. Two phases:

### Phase 1: Stream raw tokens, render on completion
- Stream tokens from the LLM to the client via SSE
- Display raw streaming text as a loading preview for all artifact types
- On stream completion, parse and render the final visualization (for JSON artifacts) or display the final text (for text artifacts)
- This gives immediate visual feedback without requiring partial JSON parsing

### Phase 2: Partial JSON rendering
- Use a partial JSON parser client-side to progressively render JSON visualizations as tokens arrive
- E.g., show causal graph nodes as they appear in the stream, before edges are complete
- Only attempted after Phase 1 is stable

## Alternatives considered
- **Improved wait-time prediction** (Bayesian updating, EMA) — still guessing; doesn't solve the fundamental problem
- **Summary-first prompting** — adds output tokens (cost), and a text summary isn't useful loading UI for graph visualizations
- **Two-phase (text then JSON)** — doubles latency
- **Remove estimation, show spinner** — no progress feedback at all

## Consequences

### Makes easier
- User sees activity immediately, reducing perceived wait
- Eliminates maintenance burden of prediction priors and analysis scripts
- Wait-time estimation code (`useWaitTimeEstimate`, `predict.ts` priors, `/api/predict` route) can be removed

### Makes harder
- `callLlm()` needs a streaming variant; caching strategy needs rethinking for streams
- JSON schema enforcement (`response_format`) may not be available in streaming mode on all providers — need to verify
- Analytics recording (token counts, latency) needs to work with streamed responses
- Testing streaming routes is more complex than batch responses
