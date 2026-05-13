# API Consistency Review: `feat/custom-artifact-types`

**Reviewer:** Claude (automated)
**Date:** 2026-04-07
**Branch:** `feat/custom-artifact-types` (8 commits, 23 files changed)
**Scope:** API routes, type system, persistence layer, component interfaces

---

## Baseline Conventions

Surveyed 5 sibling modules to establish baseline:

1. **API routes** (`causal-graph/route.ts`, `statistical-model/route.ts`, etc.) all delegate to `handleArtifactRoute()` with a fixed config object. They return `{ [responseKey]: data }` on success, `{ error, details? }` on failure with status 400/502.
2. **Error shape** is consistently `{ error: string, details?: string }` across all routes. 400 for missing required fields, 502 for LLM/parse failures.
3. **Type system** uses `ArtifactType` as a union literal. `ARTIFACT_META`, `ARTIFACT_ROUTE`, and `ARTIFACT_RESPONSE_KEY` are keyed by this type. `SELECTABLE_ARTIFACT_TYPES` is the subset users can toggle.
4. **Persistence** uses `WORKSPACE_VERSION = 2` with `WORKSPACE_KEY = "workspace-v2"`. All artifact data is stored as `string | null` at the top level of `PersistedWorkspace`. No nested data objects.
5. **Component prop threading** passes artifact data through `page.tsx` -> panel components -> feature components. Each artifact type has its own named setter (e.g., `setCausalGraph`, `setPropertyTests`).

---

## Findings

#### 1. Misleading version comment in persistence.ts
**Severity:** Inconsistent
**Location:** `app/lib/types/persistence.ts:32`
**Move:** Assess versioning impact
**Confidence:** High

The comment `// Custom artifact types and their generated data (added in v2)` is misleading. `WORKSPACE_VERSION` was already 2 on main and was not bumped by this branch. The new fields (`customArtifactTypes`, `customArtifactData`) are optional (`?`), so they are backward-compatible with existing v2 data -- but the comment implies they were part of the original v2 schema. This was also flagged as **INCORRECT** in the fact-check report.

**Recommendation:** Change the comment to `// Custom artifact types (backward-compatible addition to v2)` or similar. No version bump is actually needed since the fields are optional and `loadWorkspace()` defaults them to `[]`/`{}` when absent.

---

#### 2. ARTIFACT_RESPONSE_KEY comment oversimplifies the mapping
**Severity:** Minor
**Location:** `app/lib/types/artifacts.ts:200`
**Move:** Check naming against the grain
**Confidence:** High

The comment says `kebab-case -> camelCase` but the mapping includes `semiformal -> "proof"` and `lean -> "leanCode"`, which are not kebab-to-camelCase conversions -- they are semantic renames. This was flagged as **MOSTLY ACCURATE** in the fact-check report. The comment predates this branch (it existed on main), but the branch updated its wording from "Maps artifact types to their JSON response key" to "Maps built-in artifact types to their JSON response key" without correcting the parenthetical.

**Recommendation:** Change to `Maps built-in artifact types to their JSON response key (varies by type; not a mechanical conversion)` or remove the parenthetical entirely.

---

#### 3. Unverifiable cross-session library reference
**Severity:** Informational
**Location:** `app/lib/types/customArtifact.ts:7`
**Move:** Trace the consumer contract
**Confidence:** High

The module docstring says definitions are "optionally saved to a cross-session library." No such library feature exists in this branch or on main. This was flagged as **UNVERIFIABLE** in the fact-check report. It appears to be aspirational documentation for a feature not yet built.

**Recommendation:** Either remove the "and optionally saved to a cross-session library" clause or add a comment marking it as a planned future feature (e.g., `(planned: cross-session library)`).

---

#### 4. Custom design route does not use handleArtifactRoute
**Severity:** Inconsistent
**Location:** `app/api/custom-type/design/route.ts:35-109`
**Move:** Establish baseline conventions
**Confidence:** Medium

All 5 existing formalization routes delegate to `handleArtifactRoute()`. The new `/api/custom-type/design` route manually calls `callLlm()`, manually handles mock responses, manually parses JSON, and manually formats errors. While the route has a different semantic purpose (designing a type definition rather than generating an artifact), it duplicates the error handling and JSON parsing patterns from `handleArtifactRoute`. The custom formalization route (`/api/formalization/custom`) correctly reuses `handleArtifactRoute`, which is good.

**Recommendation:** Consider whether `handleArtifactRoute` could be parameterized to serve this use case (its `transformBody` + `mockResponse` + `parseResponse` options are already flexible). If the design route's needs genuinely differ (e.g., multi-field validation), document why it diverges. As-is, the duplicated error patterns will drift over time.

---

#### 5. Custom route response key is "result" -- breaks naming symmetry
**Severity:** Inconsistent
**Location:** `app/api/formalization/custom/route.ts:149`
**Move:** Look for the asymmetry
**Confidence:** Medium

Built-in routes use semantically meaningful response keys: `causalGraph`, `statisticalModel`, `proof`, etc. The custom route uses a generic `"result"` key. This means consumer code must special-case custom types when extracting response data (which `useArtifactGeneration.ts:56` does via `data.result ?? null`). If a custom type's LLM output happens to include a top-level `result` field, there would be no collision since it is nested, but the asymmetry is a code smell.

**Recommendation:** This is acceptable for now since custom types are inherently generic. Consider documenting the convention: custom types always use `"result"` as their response key.

---

#### 6. updateCustomArtifactType accepts Partial but handleEditCustomType passes full definition
**Severity:** Minor
**Location:** `app/hooks/useWorkspacePersistence.ts:164` and `app/page.tsx:619`
**Move:** Verify the nullability contract
**Confidence:** High

`updateCustomArtifactType` is typed as `(id: string, updates: Partial<CustomArtifactTypeDefinition>)`, but `page.tsx` always calls it as `updateCustomArtifactType(def.id, def)` -- passing the full definition. Meanwhile, `addCustomArtifactType` takes a full `CustomArtifactTypeDefinition`. The asymmetry between "add takes full, update takes partial" is a reasonable API design, but the actual call site always passes a full definition. The `Partial` signature also means `updatedAt` can be omitted by callers, but the implementation always overwrites it anyway (`updatedAt: new Date().toISOString()`).

**Recommendation:** No change needed -- the `Partial` signature is forward-compatible. But consider adding a JSDoc note that `updatedAt` is always auto-set regardless of input.

---

#### 7. customArtifactData uses flat Record but persistence uses nested optional
**Severity:** Inconsistent
**Location:** `app/hooks/useWorkspacePersistence.ts:23` vs `app/lib/types/persistence.ts:35`
**Move:** Verify the nullability contract
**Confidence:** Medium

In `WorkspaceState`, `customArtifactData` is `Record<string, string | null>` (required). In `PersistedWorkspace`, it is `Record<string, string | null> | undefined` (optional at the field level). In `ArtifactPersistenceData`, it is `Record<string, string | null> | undefined` (optional). This three-way inconsistency is handled correctly at load time (defaulting to `{}`), but the persistence type nests `customArtifactData` inside `artifacts` in `SaveWorkspaceInput` while `customArtifactTypes` is a sibling of `artifacts`. This split means custom type definitions and their data travel through different paths during save/load.

**Recommendation:** Consider whether `customArtifactData` should live alongside `customArtifactTypes` in `SaveWorkspaceInput` (outside `artifacts`) for conceptual clarity. Currently it works but is asymmetric.

---

#### 8. isCustomType type guard matches "custom-" prefix including empty suffix
**Severity:** Minor
**Location:** `app/lib/types/customArtifact.ts:33-34` and `app/lib/types/customArtifact.test.ts:10`
**Move:** Verify the nullability contract
**Confidence:** Medium

`isCustomType("custom-")` returns `true`, and a test explicitly asserts this. While `generateId()` in `CustomTypeDesigner.tsx` uses `crypto.randomUUID()` (so empty suffix is unlikely in practice), the type guard would match a malformed ID. This is a minor robustness concern for persistence -- a corrupted localStorage entry with `id: "custom-"` would pass `isValidCustomTypeDef` and `isCustomType`.

**Recommendation:** Consider tightening the guard to `type.startsWith("custom-") && type.length > 7` or adjusting the test expectation. Low priority.

---

#### 9. No explicit type-narrowing for PanelId when routing to custom panels
**Severity:** Minor
**Location:** `app/page.tsx:725-732`
**Move:** Trace the consumer contract
**Confidence:** Medium

The `renderPanel` switch statement falls through to a `default` case that checks `isCustomType(panelId)`. Since `PanelId` now includes `CustomArtifactTypeId`, this is type-safe. However, if `def` is not found (e.g., the custom type was deleted but `panelId` still references it), the code falls through to `return undefined`, which renders a blank panel. This is handled upstream by the `useEffect` that filters stale custom type IDs from `selectedArtifactTypes`, but `activePanelId` is cleaned separately in `handleDeleteCustomType` which resets to "source". The cleanup paths are correct but distributed across multiple locations.

**Recommendation:** Add a brief comment in `renderPanel`'s default case noting that the `!def` path is a safeguard for race conditions during deletion. No functional change needed.

---

## What Looks Good

- **Type system extension is clean.** Splitting `ArtifactType` into `BuiltinArtifactType | CustomArtifactTypeId` is well-designed. The `custom-` prefix convention with a type guard avoids needing a registry or enum.
- **Custom formalization route reuses `handleArtifactRoute`.** This ensures error handling, mock support, and response formatting stay consistent with built-in types.
- **Persistence backward compatibility is correct.** Optional fields with `??` defaults mean existing v2 workspaces load without issue.
- **Validation on load is thorough.** `isValidCustomTypeDef` filters corrupt definitions, and `customArtifactData` entries are type-checked individually.
- **Test coverage is meaningful.** Tests for `isCustomType`, `formatLabel`, `isValidCustomTypeDef`, and round-trip persistence cover the critical paths.
- **`MAX_SYSTEM_PROMPT_LENGTH` guard** in the custom route prevents trivially large payloads.
- **Stale selection cleanup** via `useEffect` on `customArtifactTypes` prevents orphaned custom type IDs in the selection state.

---

## Summary Table

| # | Finding | Severity | Confidence | Action |
|---|---------|----------|------------|--------|
| 1 | Misleading "added in v2" comment | Inconsistent | High | Fix comment wording |
| 2 | ARTIFACT_RESPONSE_KEY comment oversimplifies | Minor | High | Clarify or remove parenthetical |
| 3 | Unverifiable cross-session library reference | Informational | High | Remove or mark as planned |
| 4 | Design route duplicates handleArtifactRoute patterns | Inconsistent | Medium | Consider reuse or document divergence |
| 5 | Generic "result" response key for custom route | Inconsistent | Medium | Document convention |
| 6 | Partial update API vs full-definition call site | Minor | High | Add JSDoc note |
| 7 | customArtifactData split across artifacts/types | Inconsistent | Medium | Consider restructuring |
| 8 | isCustomType matches empty suffix | Minor | Medium | Consider tightening guard |
| 9 | Custom panel deletion cleanup is distributed | Minor | Medium | Add clarifying comment |

---

## Overall Assessment

The branch introduces a well-structured extension to the artifact type system. The core design decision -- prefix-based discrimination with `custom-` -- is clean and avoids registry overhead. The main consistency concerns are:

1. **Comment accuracy** (findings 1-3): three documentation inaccuracies that should be fixed before merge.
2. **Architectural divergence** (finding 4): the design route duplicates patterns that `handleArtifactRoute` already encapsulates. Worth addressing if the route will evolve.
3. **Minor asymmetries** (findings 5, 7): acceptable for now but worth noting for future maintainers.

No breaking changes to existing APIs. The persistence format is backward-compatible. **Recommend merge after fixing findings 1-3** (documentation corrections).
