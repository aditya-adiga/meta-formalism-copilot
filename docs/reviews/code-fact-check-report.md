# Code Fact-Check Report

**Repository:** meta-formalism-copilot
**Scope:** `feat/custom-artifact-types` branch diff vs `main` (23 files)
**Checked:** 2026-04-07
**Total claims checked:** 21
**Summary:** 16 verified, 2 mostly accurate, 1 stale, 1 incorrect, 1 unverifiable

---

## Claim 1: "Uniform request shape for all new artifact generation routes (003 §2)"

**Location:** `app/lib/types/artifacts.ts:2`
**Type:** Reference
**Verdict:** Verified
**Confidence:** High

The comment references decision doc `docs/decisions/003-artifact-generation-api.md`, which exists in the repository and describes the `ArtifactGenerationRequest` type as the uniform shape. The type is indeed used across all artifact routes.

**Evidence:** `docs/decisions/003-artifact-generation-api.md`, `app/lib/types/artifacts.ts:2`

---

## Claim 2: "Display metadata for each built-in artifact type"

**Location:** `app/lib/types/artifacts.ts:131`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

`ARTIFACT_META` is typed as `Record<BuiltinArtifactType, {...}>` and contains an entry for every member of the `BuiltinArtifactType` union (semiformal, lean, causal-graph, statistical-model, property-tests, dialectical-map, counterexamples). The comment was updated from "each artifact type" to "each built-in artifact type" to reflect the type change. This is accurate.

**Evidence:** `app/lib/types/artifacts.ts:131-178`, `app/lib/types/session.ts:8-16`

---

## Claim 3: "Built-in artifact types selectable as chips (lean excluded — it's step 2 of the deductive pipeline)"

**Location:** `app/lib/types/artifacts.ts:181`
**Type:** Behavioral / Architectural
**Verdict:** Verified
**Confidence:** High

`SELECTABLE_ARTIFACT_TYPES` includes semiformal, causal-graph, statistical-model, property-tests, dialectical-map, and counterexamples — but not `lean`. Lean is excluded because it is generated as part of the semiformal-to-Lean deductive pipeline, confirmed in `useArtifactGeneration.ts:32` where lean is filtered out.

**Evidence:** `app/lib/types/artifacts.ts:183-189`, `app/hooks/useArtifactGeneration.ts:32`

---

## Claim 4: "Maps built-in artifact types to their API route paths"

**Location:** `app/lib/types/artifacts.ts:191`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

`ARTIFACT_ROUTE` is typed as `Partial<Record<BuiltinArtifactType, string>>` and maps five built-in types to their `/api/formalization/*` paths. Semiformal and lean are absent (partial), which is correct since they have their own dedicated generation paths.

**Evidence:** `app/lib/types/artifacts.ts:192-198`

---

## Claim 5: "Maps built-in artifact types to their JSON response key (kebab-case -> camelCase)"

**Location:** `app/lib/types/artifacts.ts:200`
**Type:** Behavioral
**Verdict:** Mostly accurate
**Confidence:** High

The mapping converts kebab-case type names to camelCase response keys for most types (e.g., `"causal-graph"` -> `"causalGraph"`). However, `"semiformal"` maps to `"proof"` and `"lean"` maps to `"leanCode"`, which are not camelCase conversions of the type name — they are semantically different keys. The parenthetical "(kebab-case -> camelCase)" is an oversimplification.

**Evidence:** `app/lib/types/artifacts.ts:201-210`

---

## Claim 6: "All custom artifact type IDs are prefixed with 'custom-' to distinguish them from built-in types."

**Location:** `app/lib/types/customArtifact.ts:10`
**Type:** Invariant
**Verdict:** Verified
**Confidence:** High

The TypeScript template literal type `custom-${string}` enforces this at the type level. The `isCustomType` guard checks `type.startsWith("custom-")`. The `generateId()` function in `CustomTypeDesigner.tsx` produces `custom-${crypto.randomUUID()}`. The `isValidCustomTypeDef` validator also checks `v.id.startsWith("custom-")`.

**Evidence:** `app/lib/types/customArtifact.ts:11`, `app/lib/types/customArtifact.ts:33-34`, `app/components/features/artifact-selector/CustomTypeDesigner.tsx:16`, `app/lib/utils/workspacePersistence.ts:124`

---

## Claim 7: "Custom types let users design their own formalization prompts via an LLM-assisted iterative flow, then use them alongside the built-in types. Definitions are stored in the workspace persistence layer and optionally saved to a cross-session library."

**Location:** `app/lib/types/customArtifact.ts:3-7`
**Type:** Architectural
**Verdict:** Mostly accurate
**Confidence:** Medium

The first two sentences are verified: `CustomTypeDesigner.tsx` implements an LLM-assisted design flow (describe -> review/refine -> test -> save), and custom types appear alongside built-in types in the chip selector and modal. Definitions are stored in the workspace persistence layer (`useWorkspacePersistence` -> `saveWorkspace` -> `localStorage`). However, the claim "optionally saved to a cross-session library" is not implemented — there is no separate library storage mechanism. Custom types are persisted only within the current workspace.

**Evidence:** `app/components/features/artifact-selector/CustomTypeDesigner.tsx`, `app/lib/utils/workspacePersistence.ts:104`, grep for "cross-session" and "library" shows no implementation beyond this comment.

---

## Claim 8: "Type guard: returns true if an ArtifactType string is a custom type ID."

**Location:** `app/lib/types/customArtifact.ts:32`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

`isCustomType` checks `type.startsWith("custom-")` and narrows the type to `CustomArtifactTypeId`. This correctly identifies custom type IDs. The test file `customArtifact.test.ts` confirms the behavior for both positive and negative cases.

**Evidence:** `app/lib/types/customArtifact.ts:33-35`, `app/lib/types/customArtifact.test.ts:1-32`

---

## Claim 9: "Unique identifier, always starts with 'custom-'"

**Location:** `app/lib/types/customArtifact.ts:14`
**Type:** Invariant
**Verdict:** Verified
**Confidence:** High

The `id` field is typed as `CustomArtifactTypeId` which is `custom-${string}`, enforced at the type level. Runtime validation in `isValidCustomTypeDef` also checks the prefix.

**Evidence:** `app/lib/types/customArtifact.ts:11,15`, `app/lib/utils/workspacePersistence.ts:124`

---

## Claim 10: "Custom artifact types and their generated data (added in v2)"

**Location:** `app/lib/types/persistence.ts:32`
**Type:** Configuration
**Verdict:** Incorrect
**Confidence:** High

The comment says "added in v2" but `WORKSPACE_VERSION` has been 2 since before this branch — it was not incremented for this change. The custom fields are optional (`?`) and backward-compatible with existing v2 data. A more accurate statement would be "added to the v2 schema" or "extends v2". The comment implies a version bump occurred, but v2 already existed on main and no version change was made.

**Evidence:** `app/lib/types/persistence.ts:4` (`WORKSPACE_VERSION = 2`), git diff shows no change to `WORKSPACE_VERSION`

---

## Claim 11: "Fires parallel artifact generation requests for selected types."

**Location:** `app/hooks/useArtifactGeneration.ts:14`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

The function maps all selected types into an array of promises and resolves them via `Promise.allSettled`, confirming parallel execution.

**Evidence:** `app/hooks/useArtifactGeneration.ts:45-81`

---

## Claim 12: "'semiformal' calls the existing semiformal route (returns { proof })"

**Location:** `app/hooks/useArtifactGeneration.ts:17`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

When `type === "semiformal"`, the code calls `generateSemiformal(request.sourceText, request.context)` and returns the result as `proof`. The `ARTIFACT_RESPONSE_KEY` maps semiformal to `"proof"`.

**Evidence:** `app/hooks/useArtifactGeneration.ts:47-50`, `app/lib/types/artifacts.ts:202`

---

## Claim 13: "'lean' is never generated here — it's step 2 of the deductive pipeline"

**Location:** `app/hooks/useArtifactGeneration.ts:18`
**Type:** Architectural
**Verdict:** Verified
**Confidence:** High

Line 32 explicitly filters out "lean": `const types = selectedTypes.filter((t) => t !== "lean")`.

**Evidence:** `app/hooks/useArtifactGeneration.ts:32`

---

## Claim 14: "Custom types (prefixed 'custom-') use /api/formalization/custom with the system prompt in the request body"

**Location:** `app/hooks/useArtifactGeneration.ts:19-20`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

The code checks `isCustomType(type)`, looks up the definition from `customDefsMap`, and calls `fetchApi("/api/formalization/custom", { ...request, customSystemPrompt: def.systemPrompt, customOutputFormat: def.outputFormat })`.

**Evidence:** `app/hooks/useArtifactGeneration.ts:53-65`

---

## Claim 15: "All other built-in types use ARTIFACT_ROUTE and return JSON keyed by their type"

**Location:** `app/hooks/useArtifactGeneration.ts:21`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

After the semiformal and custom type branches, the code falls through to `ARTIFACT_ROUTE[type as BuiltinArtifactType]` and uses `ARTIFACT_RESPONSE_KEY[type as BuiltinArtifactType]` to extract the response.

**Evidence:** `app/hooks/useArtifactGeneration.ts:68-74`

---

## Claim 16: "Generic route for custom artifact types. The system prompt and output format are provided in the request body (since they're user-defined, not baked into a route file like built-in types)."

**Location:** `app/api/formalization/custom/route.ts:7-9`
**Type:** Architectural
**Verdict:** Verified
**Confidence:** High

The route extracts `customSystemPrompt` and `customOutputFormat` from the request body and passes them into `handleArtifactRoute` as the `systemPrompt` and `parseResponse` config. Built-in routes like `causal-graph/route.ts` have their system prompts hardcoded in the route file.

**Evidence:** `app/api/formalization/custom/route.ts:14-48`, `app/lib/formalization/artifactRoute.ts:33-44`

---

## Claim 17: "Reuses handleArtifactRoute with a transformBody that extracts the custom fields from the request and injects them as route config."

**Location:** `app/api/formalization/custom/route.ts:11-12`
**Type:** Architectural
**Verdict:** Verified
**Confidence:** High

The route calls `handleArtifactRoute(request, config)` where config includes a `transformBody` function that destructures out `customSystemPrompt` and `customOutputFormat`, passing only the standard `ArtifactGenerationRequest` fields to `buildUserMessage`.

**Evidence:** `app/api/formalization/custom/route.ts:33-48`

---

## Claim 18: "We need to peek at the body to get the custom config, then let handleArtifactRoute re-parse it. Clone the request so the body can be consumed twice."

**Location:** `app/api/formalization/custom/route.ts:15-17`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

The code calls `request.clone()` to create a copy, reads the body from the clone for validation, then passes the original `request` to `handleArtifactRoute` which reads the body again via `request.json()` at line 55 of `artifactRoute.ts`.

**Evidence:** `app/api/formalization/custom/route.ts:18-20`, `app/lib/formalization/artifactRoute.ts:55`

---

## Claim 19: "formalizeNode only handles built-in types (custom types go through useArtifactGeneration)"

**Location:** `app/lib/formalization/formalizeNode.ts:115`
**Type:** Architectural
**Verdict:** Verified
**Confidence:** High

The `generateNonDeductiveArtifacts` function explicitly returns `null` for custom types via `if (isCustomType(type)) return null`. Custom type generation is handled in `useArtifactGeneration.ts:53-65` for global-scope generation, and custom types in per-node formalization are silently skipped.

**Evidence:** `app/lib/formalization/formalizeNode.ts:116`, `app/hooks/useArtifactGeneration.ts:53-65`

---

## Claim 20: "Convert camelCase or snake_case keys to a readable label"

**Location:** `app/components/panels/CustomArtifactPanel.tsx:80`
**Type:** Behavioral
**Verdict:** Mostly accurate
**Confidence:** High

The function also handles kebab-case (the regex replaces both `_` and `-` with spaces). The test file `CustomArtifactPanel.test.ts` explicitly tests kebab-case conversion. The docstring should mention kebab-case as well.

**Evidence:** `app/components/panels/CustomArtifactPanel.tsx:81-86`, `app/components/panels/CustomArtifactPanel.test.ts:15-18`

---

## Claim 21: "Definitions are stored in the workspace persistence layer and optionally saved to a cross-session library."

**Location:** `app/lib/types/customArtifact.ts:6-7`
**Type:** Architectural
**Verdict:** Unverifiable
**Confidence:** Low

As noted in Claim 7, the "cross-session library" feature is not implemented in the current codebase. This may be a planned feature. There is no code, type definition, or storage mechanism for a separate library beyond the workspace persistence. The "optionally" qualifier makes this technically not falsifiable, but it describes a feature that does not exist.

**Evidence:** Searched entire codebase for "library" and "cross-session" references — only this comment matches.

---

## Claims Requiring Attention

### Incorrect
- **Claim 10** (`app/lib/types/persistence.ts:32`): Comment says "added in v2" but WORKSPACE_VERSION was already 2 and was not changed. The custom fields extend the existing v2 schema.

### Stale
(none)

### Mostly Accurate
- **Claim 5** (`app/lib/types/artifacts.ts:200`): "kebab-case -> camelCase" is an oversimplification — semiformal maps to "proof" and lean maps to "leanCode", which are not camelCase conversions of their type names.
- **Claim 20** (`app/components/panels/CustomArtifactPanel.tsx:80`): docstring says "camelCase or snake_case" but the function also handles kebab-case.

### Unverifiable
- **Claim 21** (`app/lib/types/customArtifact.ts:6-7`): "optionally saved to a cross-session library" — no implementation exists for this feature.
