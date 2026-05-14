# Tech Debt Triage: `feat/custom-artifact-types` Branch

**Branch:** `feat/custom-artifact-types` vs `main`
**Scope:** 23 files changed, ~1,434 lines added
**Reviewed:** 2026-04-07

---

## 1. Tech Debt: `page.tsx` God Component / Prop Drilling Depth

**Location:** `app/page.tsx` (now 780 lines), `app/components/panels/InputPanel.tsx`, `app/components/features/formalization-controls/FormalizationControls.tsx`, `app/components/features/artifact-selector/ArtifactChipSelector.tsx`

**Nature:** Structural — growing orchestrator component, deep prop threading

### Carrying Cost: High

The root `page.tsx` was already the largest and most complex file in the codebase. This branch adds 6 new props threaded through 4 component layers (`page.tsx` -> `InputPanel` -> `FormalizationControls` -> `ArtifactChipSelector`), plus 5 new state variables, 3 new callbacks, and expands the already massive `useMemo` dependency array for `renderPanel` to 57+ entries. Every new artifact-related feature will continue to inflate this file and deepen the prop chain. The `renderPanel` function is a growing switch statement that now has a dynamic `default` branch for custom types — a sign the static panel routing pattern is under strain. Cognitive load for any change touching panels or artifacts is high and rising.

### Fix Cost

- **Scope:** Cross-cutting — would touch state management, panel routing, and component boundaries
- **Effort:** 2-4 days (extract a context provider or use a lightweight state manager like Zustand)
- **Risk:** Medium — many components depend on props flowing from `page.tsx`
- **Incremental?** Yes — could start with extracting artifact state into a context/store without changing everything at once

### Urgency Triggers

- Any additional artifact types (built-in or custom) will compound this
- Adding per-node custom type support (currently excluded — `formalizeNode.ts` returns `null` for custom types) would require even more prop threading
- If multiple developers work on panels simultaneously, merge conflicts in `page.tsx` will be frequent

### Recommendation: Fix opportunistically

The current state is workable but approaching a tipping point. The next feature that adds state to `page.tsx` should include extracting artifact state into a dedicated context or store. The custom artifact feature is a good forcing function — its CRUD operations and dynamic panel routing don't belong in the root orchestrator.

---

## 2. Tech Debt: Misleading "added in v2" Comment on Persistence Schema

**Location:** `app/lib/types/persistence.ts:32`

**Nature:** Documentation / misleading comment (confirmed by fact-check)

### Carrying Cost: Low

The comment `// Custom artifact types and their generated data (added in v2)` implies a version bump occurred, but `WORKSPACE_VERSION` remains `2` (same as before this branch). The custom fields are optional (`?`) so backward compatibility is maintained, but if someone relies on version numbers to detect capabilities, this is misleading. The earlier artifact fields (lines 26-31) have an identical comment — so the pattern predates this branch, but extending it here compounds the confusion.

### Fix Cost

- **Scope:** Localized — one comment change, possibly a version bump
- **Effort:** Minutes
- **Risk:** Low (if just fixing comment); Medium (if bumping version, since migration logic would need updating)
- **Incremental?** Yes

### Urgency Triggers

- If the project ever needs to do a real schema migration (e.g., making custom fields required)
- If another developer reads this comment and assumes v2 means "has custom types"

### Recommendation: Fix now

Either bump `WORKSPACE_VERSION` to 3 with a migration path, or change the comment to say "added as optional extension to v2 schema" to avoid implying a version transition occurred. Given that all custom fields are optional with `?? []` / `?? {}` fallbacks, just fixing the comment is the lower-risk option.

---

## 3. Tech Debt: Reference to Unimplemented Cross-Session Library

**Location:** `app/lib/types/customArtifact.ts:7-8`

**Nature:** Documentation — forward reference to planned but unbuilt feature (confirmed by fact-check as unverifiable)

### Carrying Cost: Low

The module docstring says definitions are "optionally saved to a cross-session library." No such library exists — custom types are stored in the workspace persistence layer only and are lost when switching workspaces. This sets incorrect expectations for anyone reading the types to understand the system.

### Fix Cost

- **Scope:** Localized — one comment edit
- **Effort:** Minutes
- **Risk:** None
- **Incremental?** Yes

### Urgency Triggers

- When someone tries to implement cross-session sharing and assumes infrastructure exists
- User-facing confusion if custom types disappear on workspace switch

### Recommendation: Fix now

Change "and optionally saved to a cross-session library" to something like "stored per-workspace; cross-session sharing is planned but not yet implemented." This costs nothing and prevents confusion.

---

## 4. Tech Debt: Custom Types Not Integrated with Node-Level Formalization

**Location:** `app/lib/formalization/formalizeNode.ts:115-116`, `app/hooks/useArtifactGeneration.ts`

**Nature:** Structural — feature gap / asymmetry

### Carrying Cost: Medium

Custom artifact types work at the global (whole-source) level but are silently skipped during per-node formalization (`formalizeNode` returns `null` for custom types). The auto-formalization queue, which processes decomposition nodes, will therefore never generate custom artifacts for individual propositions. There is no UI indication that custom types are global-only. Users who decompose their source and then expect custom artifacts per-node will get nothing without explanation.

### Fix Cost

- **Scope:** Cross-cutting — would need to thread custom type definitions through `formalizeNode`, the queue, and node detail UI
- **Effort:** 1-2 days
- **Risk:** Medium — `formalizeNode` has a different request/response flow than `useArtifactGeneration`
- **Incremental?** Yes — could add a "global only" badge to custom type chips as a quick stopgap

### Urgency Triggers

- When users start using decomposition alongside custom types (the two features intersect naturally)
- If the auto-formalize queue is promoted as a primary workflow

### Recommendation: Carry intentionally

This is a known scope limitation, not accidental debt. The `formalizeNode` comment explicitly says custom types go through `useArtifactGeneration`. However, the lack of user-facing indication is a UX gap. Add a brief tooltip or badge ("global only") to custom type chips as a low-cost fix, and defer full node-level integration until there's user demand.

---

## 5. Tech Debt: `useWorkspacePersistence` Hook Monolith

**Location:** `app/hooks/useWorkspacePersistence.ts` (now 327 lines)

**Nature:** Structural — growing god-hook

### Carrying Cost: Medium

This hook now manages: source text, extracted files, context text, semiformal text, lean code, verification state, 5 built-in artifact types, custom type definitions (CRUD), custom artifact data, decomposition state, workspace snapshots, and auto-save debouncing. It exposes 25+ values/setters through a single `useMemo`. The custom artifact additions added 6 new exported functions and 2 new state fields. Each new artifact type or state dimension inflates this hook further.

### Fix Cost

- **Scope:** Cross-cutting — consumers of the hook would need updating
- **Effort:** 1-2 days to split into composable hooks (e.g., `useArtifactPersistence`, `useCustomTypePersistence`)
- **Risk:** Low-medium — the hook is the single source of truth, so splitting requires careful coordination of the save/load cycle
- **Incremental?** Yes — custom type state could be extracted first since it's relatively self-contained

### Urgency Triggers

- Next feature adding persisted state
- Performance issues from the growing `useMemo` dependency array (currently mitigated by debounced saves)

### Recommendation: Fix opportunistically

The hook works correctly today but is becoming hard to reason about. When the next feature adds persisted state, extract custom type management into its own composable hook as part of that work.

---

## 6. Tech Debt: `CustomTypeDesigner` as a Monolithic Modal (321 Lines)

**Location:** `app/components/features/artifact-selector/CustomTypeDesigner.tsx`

**Nature:** Structural — large single-file component with mixed concerns

### Carrying Cost: Low

The designer component manages three wizard steps (describe, review, test), API calls, form state, and all the associated UI in a single 321-line file. It works, but the review step alone has 7 form fields rendered inline with repeated styling patterns. If the designer needs additional steps or more complex validation, this file will be difficult to extend.

### Fix Cost

- **Scope:** Localized — internal refactor only
- **Effort:** Half a day
- **Risk:** Low
- **Incremental?** Yes — could extract step components one at a time

### Urgency Triggers

- Adding versioning or diff display for type definitions
- Adding export/import of custom type definitions
- Adding the cross-session library feature

### Recommendation: Carry intentionally

321 lines for a wizard modal is within reasonable bounds. The three steps are clear and the logic is straightforward. Refactor when the component needs to grow, not preemptively.

---

## 7. Tech Debt: No Input Sanitization for User-Provided System Prompts

**Location:** `app/api/formalization/custom/route.ts`, `app/components/features/artifact-selector/CustomTypeDesigner.tsx`

**Nature:** Security / robustness

### Carrying Cost: Medium

Users provide system prompts that are sent directly to the LLM. The only validation is a length check (`MAX_SYSTEM_PROMPT_LENGTH = 10_000`). There is no sanitization, content filtering, or rate limiting. While this is an internal/research tool (not public-facing), the system prompt is persisted to localStorage and could contain injection patterns that affect other users if workspaces are ever shared (e.g., via the planned export feature).

### Fix Cost

- **Scope:** Localized — API route + possibly a shared validation utility
- **Effort:** Hours
- **Risk:** Low
- **Incremental?** Yes

### Urgency Triggers

- If workspaces become sharable/exportable
- If the tool is deployed for multi-user access
- If LLM provider billing becomes a concern (a malicious prompt could be designed to maximize token usage)

### Recommendation: Defer and monitor

For a single-user research tool, the current length check is adequate. Revisit when workspace sharing or multi-user deployment is on the roadmap. Add a brief comment noting the limitation.

---

## 8. Tech Debt: Repeated Tailwind Class Strings / Inline Styles

**Location:** `app/components/features/artifact-selector/CustomTypeDesigner.tsx`, `app/components/features/artifact-selector/ArtifactTypeModal.tsx`, `app/components/panels/CustomArtifactPanel.tsx`

**Nature:** Styling duplication

### Carrying Cost: Low

The new components repeat long Tailwind class strings for form inputs, buttons, section headers, and card layouts. For example, the input field styling pattern `"w-full rounded border border-[#DDD9D5] bg-white px-3 py-1.5 text-sm text-[var(--ink-black)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-black)]"` appears 6+ times across the designer. This is consistent with the existing codebase pattern (other panels have similar repetition), but the custom type feature adds more of it.

### Fix Cost

- **Scope:** Localized to new files, but a proper fix would establish shared component primitives
- **Effort:** Half a day for shared input/button components
- **Risk:** Low
- **Incremental?** Yes

### Urgency Triggers

- Theme changes requiring updates to many files
- Adding more custom type UI features

### Recommendation: Carry intentionally

This matches the existing codebase style. Extracting shared form primitives would be valuable but is a separate initiative, not specific to this branch.

---

## Summary Table

| # | Debt Item | Carrying Cost | Fix Cost | Urgency | Recommendation |
|---|-----------|--------------|----------|---------|----------------|
| 1 | `page.tsx` god component / prop drilling | High | 2-4 days, medium risk | Next panel feature | Fix opportunistically |
| 2 | Misleading "added in v2" comment | Low | Minutes, low risk | Now | **Fix now** |
| 3 | Reference to unimplemented cross-session library | Low | Minutes, no risk | Now | **Fix now** |
| 4 | Custom types not integrated with node formalization | Medium | 1-2 days, medium risk | User demand | Carry intentionally |
| 5 | `useWorkspacePersistence` monolith | Medium | 1-2 days, low-medium risk | Next persisted state addition | Fix opportunistically |
| 6 | `CustomTypeDesigner` single-file modal | Low | Half day, low risk | Feature expansion | Carry intentionally |
| 7 | No system prompt sanitization | Medium | Hours, low risk | Multi-user / sharing | Defer and monitor |
| 8 | Repeated Tailwind class strings | Low | Half day, low risk | Theme changes | Carry intentionally |

## Recommended Fix Order

1. **Items 2 and 3 (now):** Fix the misleading comment and the unimplemented feature reference. These are minutes of work with zero risk and prevent ongoing confusion.
2. **Item 1 (next feature touching panels):** Extract artifact state from `page.tsx` into a context or store. This is the highest-carrying-cost item and gets worse with every feature.
3. **Item 5 (alongside item 1):** Split `useWorkspacePersistence` when extracting artifact state — the two cleanups naturally compose.
4. **Item 4 (when user demand exists):** Add node-level custom type support or at minimum a "global only" indicator.
5. **Items 6, 7, 8:** Carry or defer as described.
