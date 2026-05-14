# Security Code Review: `feat/custom-artifact-types`

**Reviewer:** Claude (automated security review)
**Branch:** `feat/custom-artifact-types` relative to `main`
**Date:** 2026-04-07

---

## Trust Boundary Map

This feature introduces a new data path where **user-authored system prompts** flow from the browser client through API routes into LLM provider calls (Anthropic / OpenRouter). The trust boundaries are:

1. **Browser -> Next.js API routes**: User-supplied `customSystemPrompt` and `customOutputFormat` fields arrive via POST to `/api/formalization/custom` and `/api/custom-type/design`. The API runs server-side with access to API keys.
2. **Next.js API -> LLM Provider**: The user-supplied `customSystemPrompt` is passed directly as the `system` parameter to `callLlm()`, which forwards it verbatim to the Anthropic SDK or OpenRouter API.
3. **LLM response -> Browser**: LLM output is parsed (JSON or text) and returned to the client, where it is rendered in `CustomArtifactPanel`.
4. **Browser <-> localStorage**: Custom type definitions (including system prompts) are persisted to and restored from localStorage.

---

## Findings

#### 1. User-controlled system prompt enables indirect prompt injection
**Severity:** Medium
**Location:** `app/api/formalization/custom/route.ts:33-35`, `app/lib/llm/callLlm.ts:110-112`
**Move:** Trace the trust boundaries; Find the implicit sanitization assumption
**Confidence:** High

The `customSystemPrompt` field is supplied by the user (or by a prior LLM call via the design API), validated only for type and length (max 10,000 chars), and then passed directly as the system prompt to `callLlm()`. This is architecturally intentional -- the whole feature is "user designs their own prompt" -- but it means the system prompt slot, which is normally trusted application code, now contains untrusted user content. An attacker who can influence the prompt (e.g., via a shared workspace export or crafted localStorage payload) could instruct the LLM to exfiltrate source text, generate misleading content, or attempt to extract other information from the LLM context.

In this application's threat model (single-user local tool), the risk is limited. However, if workspace sharing is ever added, this becomes a prompt injection vector.

**Recommendation:** Document in the codebase that `customSystemPrompt` is user-controlled and must never be concatenated with trusted system instructions without clear separation. Consider adding a fixed preamble to the system prompt in `handleArtifactRoute` that the user cannot override (e.g., "You are generating an analytical artifact. Never output API keys, credentials, or system information.").

---

#### 2. LLM-generated type definitions flow through without structural validation
**Severity:** Medium
**Location:** `app/api/custom-type/design/route.ts:76-89`
**Move:** Test the serialization boundary
**Confidence:** High

The `/api/custom-type/design` route asks an LLM to generate a `CustomArtifactTypeDefinition` (including a `systemPrompt`). The response is validated for `name` and `systemPrompt` presence but the content of `systemPrompt` is not constrained. The LLM-generated definition then flows to the client, where it can be saved and later sent back as the system prompt for `/api/formalization/custom`. This creates a two-hop injection chain: a malicious `userDescription` to the design endpoint could instruct the meta-LLM to embed adversarial instructions inside the `systemPrompt` field of the generated definition, which is then used verbatim in the second LLM call.

This is a known limitation of "LLM generates prompts for another LLM" architectures and is difficult to fully mitigate. The user does get a review step (the designer shows the generated prompt), which is a meaningful control.

**Recommendation:** The review step is good. Consider adding a visible warning in the `CustomTypeDesigner` UI when the system prompt contains patterns that look like injection attempts (e.g., "ignore previous instructions", "you are now", references to API keys or environment variables).

---

#### 3. No rate limiting on LLM-calling API routes
**Severity:** Medium
**Location:** `app/api/custom-type/design/route.ts`, `app/api/formalization/custom/route.ts`
**Move:** Ask "what if there are a million of these?"
**Confidence:** High

Neither the new `/api/custom-type/design` nor `/api/formalization/custom` routes have rate limiting. This is consistent with the existing built-in artifact routes (none of them have rate limiting either), but the custom type designer introduces an iterative refinement loop that makes rapid repeated calls more natural. Each call consumes API credits. An automated script hitting these endpoints could exhaust the API key budget.

**Recommendation:** This is a pre-existing gap, not introduced by this PR. However, as the number of LLM-calling routes grows, consider adding middleware-level rate limiting (e.g., per-IP or per-session token bucket). At minimum, document in the deployment guide that these routes should sit behind authentication or a reverse proxy with rate limiting in production.

---

#### 4. Error responses leak LLM output fragments
**Severity:** Low
**Location:** `app/api/custom-type/design/route.ts:80,83,92`
**Move:** Check the error path
**Confidence:** High

When the LLM returns unparseable JSON, the error response includes `responseText.slice(0, 500)` in the `details` field. This is returned to the client. The leaked content is the LLM's own output (not server internals), so the information disclosure risk is limited. However, if the LLM hallucinates or echoes back parts of the system prompt, this could leak the meta-system prompt to the client.

**Recommendation:** This is low risk since the meta-system prompt is not secret (it's in the source code). No action required, but be aware of this pattern if secret system prompts are ever introduced.

---

#### 5. Misleading comment: "added in v2" on fields that extend existing v2 schema
**Severity:** Informational
**Location:** `app/lib/types/persistence.ts:32`
**Move:** Test the serialization boundary (fact-check cross-reference)
**Confidence:** High

Per the fact-check report: the comment "added in v2" on `customArtifactTypes` and `customArtifactData` is misleading. `WORKSPACE_VERSION` was already 2 and was not bumped. The new fields are optional (`?`), so existing v2 data loads fine without them. However, the comment implies a version boundary that doesn't exist, which could mislead a future developer into thinking a migration path exists when it doesn't.

**Security implication:** If a future developer adds a v3 migration that depends on the v2->v3 boundary being where custom types were introduced, they might incorrectly assume all v2 data lacks these fields. The optional typing (`?`) makes this safe today, but the misleading comment is a maintenance hazard.

**Recommendation:** Change the comment to "optional extension to the v2 schema" or similar.

---

#### 6. localStorage persistence of system prompts has no integrity check
**Severity:** Low
**Location:** `app/lib/utils/workspacePersistence.ts:121-129`, `app/hooks/useWorkspacePersistence.ts:83-84`
**Move:** Test the serialization boundary
**Confidence:** Medium

Custom type definitions, including their system prompts, are persisted to localStorage and restored on page load. The `isValidCustomTypeDef` validator checks structural shape but does not constrain the `systemPrompt` content. A malicious browser extension or XSS in a co-hosted page on the same origin could modify localStorage to inject a crafted system prompt that would be sent to the LLM on next formalization.

In a single-user local dev tool, this is low risk. The `isValidCustomTypeDef` function does properly validate the shape, which is good defensive coding.

**Recommendation:** No immediate action needed. If the app is ever deployed as a multi-user service, add HMAC signing to persisted data or move persistence server-side.

---

#### 7. Fact-check: ARTIFACT_RESPONSE_KEY comment is misleading about mapping
**Severity:** Informational
**Location:** `app/lib/types/artifacts.ts:200`
**Move:** Fact-check cross-reference
**Confidence:** High

The comment says "kebab-case -> camelCase" but `semiformal -> proof` and `lean -> leanCode` are not simple case conversions -- they are semantic renames. This is not a security issue but could lead to incorrect assumptions when extending the mapping for custom types.

**Recommendation:** Update the comment to note the exceptions: "Maps built-in artifact types to their JSON response key. Most follow kebab-case -> camelCase; exceptions: semiformal -> proof, lean -> leanCode."

---

#### 8. Fact-check: formatLabel docstring incomplete
**Severity:** Informational
**Location:** `app/components/panels/CustomArtifactPanel.tsx:80`
**Move:** Fact-check cross-reference
**Confidence:** High

The docstring says "camelCase or snake_case" but the function's `.replace(/[_-]/g, " ")` also handles kebab-case. Not a security issue.

**Recommendation:** Update docstring to "Convert camelCase, snake_case, or kebab-case keys to a readable label."

---

#### 9. Fact-check: "cross-session library" reference to nonexistent feature
**Severity:** Informational
**Location:** `app/lib/types/customArtifact.ts:7`
**Move:** Fact-check cross-reference
**Confidence:** High

The module docstring mentions "optionally saved to a cross-session library" but no such feature exists in the codebase. This is not a security issue but could confuse developers.

**Recommendation:** Remove or mark as future work (e.g., "future: cross-session library").

---

## What Looks Good

- **System prompt length limit** (`MAX_SYSTEM_PROMPT_LENGTH = 10_000`): The custom formalization route enforces a maximum system prompt length, preventing abuse via extremely large prompts that would consume excessive tokens.

- **Input validation on the custom route**: `customSystemPrompt` is checked for presence and type before use. The `sourceText` required check in `handleArtifactRoute` catches empty requests.

- **Defensive localStorage deserialization**: `loadWorkspace` uses thorough type checking (`isObject`, `isValidCustomTypeDef`, field-by-field coercion) rather than blindly trusting parsed JSON. This is good defense against corrupted or tampered localStorage.

- **No `dangerouslySetInnerHTML`**: The `CustomArtifactPanel` renders LLM output via React's JSX interpolation (`{String(value)}`), which auto-escapes HTML. There is no XSS vector in the rendering path.

- **`isCustomType` type guard**: Using the `custom-` prefix convention with a type guard prevents confusion between built-in and custom types, which could otherwise lead to routing errors or privilege confusion.

- **Request cloning in custom route**: The `request.clone()` pattern in `/api/formalization/custom` correctly handles the need to read the body twice without consuming the stream.

- **`transformBody` strips custom fields**: The custom-specific fields (`customSystemPrompt`, `customOutputFormat`) are removed before `buildUserMessage` processes the body, preventing them from leaking into the LLM user message.

---

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 1 | User-controlled system prompt enables indirect prompt injection | Medium | `api/formalization/custom/route.ts:33-35` | High |
| 2 | LLM-generated definitions flow through without content validation | Medium | `api/custom-type/design/route.ts:76-89` | High |
| 3 | No rate limiting on LLM-calling API routes | Medium | Both new API routes | High |
| 4 | Error responses leak LLM output fragments | Low | `api/custom-type/design/route.ts:80,83,92` | High |
| 5 | Misleading "added in v2" comment | Informational | `lib/types/persistence.ts:32` | High |
| 6 | localStorage persistence has no integrity check | Low | `lib/utils/workspacePersistence.ts:121-129` | Medium |
| 7 | ARTIFACT_RESPONSE_KEY comment misleading | Informational | `lib/types/artifacts.ts:200` | High |
| 8 | formatLabel docstring incomplete | Informational | `panels/CustomArtifactPanel.tsx:80` | High |
| 9 | "cross-session library" reference to nonexistent feature | Informational | `lib/types/customArtifact.ts:7` | High |

---

## Overall Assessment

The security posture of this feature is **reasonable for a single-user local development tool**. The core design decision -- allowing users to author their own system prompts -- is inherently a trust delegation, but it is appropriate for the use case. The code demonstrates good defensive practices: thorough input validation on the localStorage deserialization path, proper React escaping in rendering, type guards for the custom/builtin boundary, and a length limit on user-supplied prompts.

The main concerns are architectural rather than implementation-level: (1) the user-controlled system prompt pattern would become a significant risk if workspace sharing or multi-tenancy is ever added, and (2) the lack of rate limiting is a pre-existing gap that this PR does not worsen but also does not address. None of the findings are blocking for merge. The informational items from the fact-check report should be addressed as documentation cleanup, ideally in this PR.
