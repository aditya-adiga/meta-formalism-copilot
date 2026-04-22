# 005: Custom Artifact Type Trust Model

**Status:** Accepted  
**Date:** 2026-04-07

## Context

Custom artifact types let users design their own LLM system prompts via the
Custom Type Designer, then use those prompts to generate artifacts from source
text. The user-authored system prompt is sent directly to the LLM as the
`systemPrompt` parameter in `/api/formalization/custom`.

This means a user can craft a prompt that instructs the LLM to ignore the source
text, produce misleading output, or attempt prompt-injection patterns.

## Decision

This is acceptable because the trust model is **single-tenant, user-as-operator**.
The person authoring the system prompt is the same person viewing the output.
There is no scenario where one user's custom prompt processes another user's data.

Safeguards in place:
- **Length limit** (`MAX_SYSTEM_PROMPT_LENGTH = 10,000`): bounds resource usage
  and limits attack surface for extremely long injection attempts.
- **Validation on load** (`isValidCustomTypeDef`): ensures persisted definitions
  are well-formed before use, protecting against localStorage corruption.
- **Output format enforcement**: the route defaults to JSON parsing; malformed
  LLM responses are caught and surfaced as errors rather than silently rendered.

Safeguards explicitly *not* added (and why):
- **Content filtering on system prompts**: would limit legitimate use cases
  (e.g., prompts about sensitive topics for academic analysis) without providing
  real protection, since the user controls both sides of the interaction.
- **Sandboxed execution**: the LLM output is rendered as text/JSON in React, not
  executed. No `dangerouslySetInnerHTML` or `eval` paths exist.

## Consequences

- If the app ever becomes multi-tenant (shared workspaces, collaborative editing),
  this decision must be revisited. Custom system prompts would need review/approval
  workflows or content policy enforcement.
- The `customSystemPrompt` field should never be logged server-side in full, as it
  may contain user content the user considers private.
