# Test Strategy Review: `feat/custom-artifact-types`

**Branch:** `feat/custom-artifact-types`  
**Date:** 2026-04-07  
**Files changed:** 23 (1434 additions, 193 deletions)  
**Existing tests passing:** 173/173

---

## Risk Profile

### What can go wrong?

1. **Persistence corruption / data loss** — Custom type definitions and their generated data are stored alongside existing workspace state in localStorage. Malformed data on load could crash the app or silently lose custom types.
2. **Type system widening breaks existing flows** — `ArtifactType` was widened from a fixed union (`BuiltinArtifactType`) to include `CustomArtifactTypeId`. Any code that exhaustively switches on artifact types or indexes `ARTIFACT_ROUTE`/`ARTIFACT_RESPONSE_KEY` with the wider type could fail at runtime.
3. **Custom system prompt injection** — User-provided system prompts are passed directly to the LLM. The `MAX_SYSTEM_PROMPT_LENGTH` guard (10,000 chars) exists, but there are no sanitization checks beyond length.
4. **Stale panel/selection state** — When a custom type is deleted, its ID must be removed from `selectedArtifactTypes` and the active panel must fall back. The cleanup in `handleDeleteCustomType` could miss edge cases (e.g., node-level selections).
5. **JSON parsing in CustomArtifactPanel** — The panel tries `JSON.parse` on content for JSON-format custom types. Malformed LLM output falls back to text display, but deeply nested or very large JSON could cause rendering issues.

### Blast radius

Custom artifact types touch the root orchestrator (`page.tsx`), persistence layer, artifact generation hook, panel definitions, and two new API routes. A bug in persistence could affect all workspace data, not just custom types.

### Change frequency

This is a new feature with active iteration (8 commits on the branch). The type system changes and persistence additions are likely stable; the UI components (CustomTypeDesigner) may continue to evolve.

---

## Existing Coverage Survey

### Tests already on this branch

| File | What it tests | Coverage |
|------|--------------|----------|
| `app/lib/types/customArtifact.test.ts` | `isCustomType` type guard — valid IDs, built-in types, edge cases | Good: 6 cases |
| `app/components/panels/CustomArtifactPanel.test.ts` | `formatLabel` utility — camelCase, snake_case, kebab-case, edge cases | Good: 6 cases |
| `app/lib/utils/workspacePersistence.test.ts` (additions) | `isValidCustomTypeDef` validation + save/load round-trip + backward compat + filtering invalid defs | Good: 7 cases |

### What is NOT tested

- API routes (`custom-type/design`, `formalization/custom`) — no unit tests
- `useWorkspacePersistence` hook — no tests for the new custom type CRUD methods (`addCustomArtifactType`, `updateCustomArtifactType`, `removeCustomArtifactType`, `setCustomArtifactContent`)
- `useArtifactGeneration` — no tests for the new custom type branching logic
- `usePanelDefinitions` — no tests for dynamic custom panel entries
- `CustomTypeDesigner` component — no tests (complex multi-step wizard with API calls)
- `ArtifactChipSelector` / `ArtifactTypeModal` — existing tests not updated for custom type props
- `page.tsx` orchestration — no tests for custom type wiring (stale ID cleanup, delete handler, panel rendering)
- `formalizeNode.ts` — no tests for the `isCustomType` early-return guard

### Project test patterns

- **Framework:** Vitest + jsdom + React Testing Library + `@testing-library/jest-dom`
- **File location:** Co-located with source (`.test.ts` / `.test.tsx` next to the file being tested)
- **Naming:** `describe("functionName")` or `describe("ComponentName")` with `it("description")`
- **Mocking:** `vi.mock()` for modules; `localStorage.clear()` in `beforeEach` for persistence tests
- **Hook testing:** `renderHook` + `act` from `@testing-library/react`
- **No API route tests exist in the project** — routes are tested manually or via integration

---

## Fact-Check Findings

### CONFIRMED INCORRECT: `persistence.ts:32` comment says "added in v2" but version wasn't bumped

The comment on line 32 of `persistence.ts` reads `// Custom artifact types and their generated data (added in v2)`. `WORKSPACE_VERSION` remains `2` (line 4) and `WORKSPACE_KEY` remains `"workspace-v2"` (line 5). These custom fields are optional (`?`) so they are backward-compatible within v2 — no migration is needed and no version bump occurred. The comment is technically accurate (these fields were added to the v2 schema) but misleading — it suggests a version change happened. A clearer comment would be: "Custom artifact types (optional extension to v2 schema)."

**Risk:** Low. Since the fields are optional and `loadWorkspace` defaults missing fields to `[]`/`{}`, no data loss occurs. But the comment could confuse future developers.

### CONFIRMED UNVERIFIABLE: `customArtifact.ts:7` mentions cross-session library

Line 7-8 of `customArtifact.ts` reads: "Definitions are stored in the workspace persistence layer and optionally saved to a cross-session library." No cross-session library feature exists in this branch or the codebase. The `customArtifactTypes` array is stored per-workspace in localStorage — there is no shared library across workspaces or sessions.

**Risk:** Low (documentation inaccuracy). But it could lead someone to look for library functionality that doesn't exist.

---

## Recommended Tests

### 1. useWorkspacePersistence custom type CRUD

**Type:** Unit (hook test)  
**Priority:** High  
**File:** `app/hooks/useWorkspacePersistence.test.ts`  
**What it verifies:** The new CRUD operations for custom artifact types correctly update state and trigger persistence.  
**Key cases:**
- `addCustomArtifactType` adds a definition and it appears in `customArtifactTypes`
- `updateCustomArtifactType` with a new `systemPrompt` clears the corresponding entry in `customArtifactData` (stale data cleanup)
- `updateCustomArtifactType` without changing `systemPrompt` preserves `customArtifactData`
- `removeCustomArtifactType` removes the definition AND its entry from `customArtifactData`
- `setCustomArtifactContent` stores content keyed by custom type ID
- `setCustomArtifactContent` with same value returns same state reference (no-op optimization)
- Round-trip: add type, set content, save (via debounce timer), reload hook — data survives

**Setup needed:** `localStorage.clear()` in `beforeEach`; `vi.useFakeTimers()` for debounce; `renderHook` + `act` pattern matching existing tests in this file.

---

### 2. useArtifactGeneration custom type routing

**Type:** Unit (hook test)  
**Priority:** High  
**File:** `app/hooks/useArtifactGeneration.test.ts` (new file)  
**What it verifies:** Custom artifact types are routed to `/api/formalization/custom` with the correct body; built-in types still use their standard routes.  
**Key cases:**
- Custom type ID (`custom-xyz`) calls `/api/formalization/custom` with `customSystemPrompt` and `customOutputFormat` in the body
- Custom type with no matching definition in `customTypeDefs` returns `[type, null]`
- Built-in type (`causal-graph`) still calls its standard route
- `"lean"` type is filtered out (existing behavior preserved)
- Mixed array of custom + built-in types generates all in parallel

**Setup needed:** Mock `fetchApi` and `generateSemiformal` via `vi.mock("@/app/lib/formalization/api")`; provide `CustomArtifactTypeDefinition[]` fixtures.

---

### 3. Custom artifact API route validation

**Type:** Unit  
**Priority:** High  
**File:** `app/api/formalization/custom/route.test.ts` (new file)  
**What it verifies:** The `/api/formalization/custom` route correctly validates input and delegates to `handleArtifactRoute`.  
**Key cases:**
- Returns 400 when `customSystemPrompt` is missing
- Returns 400 when `customSystemPrompt` is not a string
- Returns 400 when `customSystemPrompt` exceeds `MAX_SYSTEM_PROMPT_LENGTH` (10,000 chars)
- Valid request calls `handleArtifactRoute` with correct config (systemPrompt, responseKey, parseResponse)
- `transformBody` strips `customSystemPrompt` and `customOutputFormat` from the body before passing to `buildUserMessage`
- `customOutputFormat: "text"` sets `parseResponse: "text"`; default/json sets `parseResponse: "json"`

**Setup needed:** Mock `handleArtifactRoute` via `vi.mock("@/app/lib/formalization/artifactRoute")`; construct `NextRequest` objects with JSON bodies.

---

### 4. Design API route validation and response handling

**Type:** Unit  
**Priority:** Medium  
**File:** `app/api/custom-type/design/route.test.ts` (new file)  
**What it verifies:** The design route validates input, constructs the user message correctly, and handles LLM response parsing.  
**Key cases:**
- Returns 400 when neither `userDescription` nor `refinementInstruction` is provided
- Constructs user message with all three parts when all provided (`userDescription`, `currentDraft`, `refinementInstruction`)
- Returns mock definition when `usage.provider === "mock"`
- Returns 502 when LLM response is missing `name` field
- Returns 502 when LLM response is missing `systemPrompt` field
- Defaults `outputFormat` to `"json"` when missing or invalid in LLM response
- Returns 502 when LLM response is not valid JSON

**Setup needed:** Mock `callLlm` via `vi.mock("@/app/lib/llm/callLlm")`; mock `stripCodeFences`.

---

### 5. usePanelDefinitions with custom types

**Type:** Unit (hook test)  
**Priority:** Medium  
**File:** `app/hooks/usePanelDefinitions.test.ts` (new file)  
**What it verifies:** Custom artifact types generate dynamic panel entries in the correct position (after built-in artifacts, before meta).  
**Key cases:**
- No custom types: panel list matches existing built-in set
- One custom type with data: panel appears in artifacts group with "Ready" status
- One custom type without data and not loading: panel is hidden
- One custom type currently loading: panel appears with "Generating..." status
- Custom type panel uses `CustomArtifactIcon` and the type's `name` as label

**Setup needed:** Minimal `PanelDefsInput` fixture; `renderHook`.

---

### 6. CustomArtifactPanel rendering

**Type:** Unit (component test)  
**Priority:** Medium  
**File:** `app/components/panels/CustomArtifactPanel.test.tsx` (extend existing `.test.ts`)  
**What it verifies:** The panel correctly renders JSON and text content, handles malformed JSON gracefully.  
**Key cases:**
- JSON outputFormat with valid JSON string: renders sections with formatted labels
- JSON outputFormat with malformed JSON: falls back to text display
- Text outputFormat: renders as prose paragraph
- Null content: renders empty message
- Loading state: renders loading message
- Nested JSON objects: renders recursively
- Array JSON values: renders list with count

**Setup needed:** Mock `ArtifactPanelShell` or render full component tree; provide `CustomArtifactTypeDefinition` and content fixtures.

---

### 7. Stale custom type cleanup in page.tsx

**Type:** Integration  
**Priority:** Medium  
**File:** `app/page.test.tsx` (new file, or skip — see "What NOT to Test")  
**What it verifies:** When a custom type is removed, its ID is removed from `selectedArtifactTypes` and the active panel falls back to "source".  
**Key cases:**
- Removing a custom type that is in `selectedArtifactTypes` filters it out
- Removing a custom type that is the active panel resets to "source"
- Removing a custom type that is NOT selected or active is a no-op

**Setup needed:** This tests `handleDeleteCustomType` and the `useEffect` cleanup. Given the complexity of `page.tsx` dependencies, this may be better tested as part of e2e tests rather than unit tests. See "What NOT to Test" section.

---

### 8. formalizeNode custom type guard

**Type:** Unit  
**Priority:** Low  
**File:** `app/lib/formalization/formalizeNode.test.ts` (new file)  
**What it verifies:** `generateNonDeductiveArtifacts` returns null for custom type IDs (they should only be generated via `useArtifactGeneration`).  
**Key cases:**
- Custom type ID in the types array is skipped (returns null)
- Built-in types still generate normally

**Setup needed:** Mock `fetchApi`; this function is not exported directly, so may need to test via the exported `formalizeNode` or refactor for testability.

---

## What NOT to Test

### `page.tsx` orchestration (recommended: skip unit tests)
The root orchestrator wires together 15+ hooks and renders 10+ panel types. Unit-testing it requires mocking the entire hook surface. The wiring logic (storing custom artifact results, passing props through) is better verified through integration/e2e tests or manual testing. The individual pieces (hooks, components) should be tested in isolation.

### `CustomTypeDesigner` component (recommended: defer)
This is a complex multi-step wizard with async API calls, controlled form state, and modal behavior. It has no pure logic worth unit-testing separately (the interesting behavior is the API interaction). If it stabilizes, snapshot tests of each step's rendered state could be valuable.

### `ArtifactChipSelector` / `ArtifactTypeModal` custom type rendering (recommended: low priority)
These are presentational components. The custom type integration adds props and renders them in the same pattern as built-in types. Visual regression or e2e tests are more appropriate than unit tests.

### `PanelIcons` (recommended: never)
`CustomArtifactIcon` is a static SVG component. Testing it provides no value.

---

## Coverage Gaps Beyond Current Scope

1. **No existing API route tests anywhere in the project.** The two new routes follow the same pattern as existing routes (e.g., `formalization/causal-graph`), none of which are tested. This is a systemic gap, not specific to this branch.

2. **`useArtifactGeneration` has zero tests** (not just for custom types — the entire hook is untested). This is the central artifact generation dispatcher. Adding tests for the custom type branch would also cover the existing built-in logic.

3. **`useWorkspacePersistence` hook tests do not cover artifact data** (existing tests only check basic scalar fields). The `customArtifactData` round-trip tests in `workspacePersistence.test.ts` (the utility, not the hook) partially cover this.

4. **No e2e tests exist in the project.** The custom type workflow (describe -> design -> review -> test -> save -> generate -> view) is a multi-step flow that would benefit from a Playwright or Cypress test.

---

## Priority Summary

| Priority | Test | Effort | Risk Reduced |
|----------|------|--------|-------------|
| **High** | useWorkspacePersistence custom CRUD | Low | Persistence correctness for custom types |
| **High** | useArtifactGeneration custom routing | Medium | Correct API dispatch for custom vs built-in |
| **High** | Custom artifact API route validation | Medium | Input validation and security boundary |
| **Medium** | Design API route validation | Medium | LLM response handling robustness |
| **Medium** | usePanelDefinitions with custom types | Low | Dynamic panel generation correctness |
| **Medium** | CustomArtifactPanel rendering | Low | JSON/text display and error handling |
| **Medium** | Stale type cleanup | High | State consistency on delete |
| **Low** | formalizeNode guard | Low | Prevents accidental custom type in node flow |
