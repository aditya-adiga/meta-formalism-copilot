# Code Review Rubric

**Scope:** `feat/custom-artifact-types` vs `main` — 23 files, +1434/-193 | **Reviewed:** 2026-04-07 | **Status: ✅ PASSES REVIEW**

---

## 🔴 Must Fix

Issues that must be resolved before merge. Draft cannot pass review with any red items unresolved.

| # | Finding | Domain | Location | Status |
|---|---|---|---|---|
| — | No red items | — | — | — |

---

## 🟡 Must Address

Issues that must be fixed or acknowledged by the author with justification for why they stand. Each must carry a resolution or author note.

| # | Finding | Domain | Source | Status | Author note |
|---|---|---|---|---|---|
| A1 | `usePanelDefinitions` invalidated on every loading state change — passing unstable `artifactLoadingState` object breaks granular memo deps | Performance | Performance reviewer | ✅ Fixed | Derived stable `customLoadingKey` string instead of passing whole object |
| A2 | `renderPanel` useCallback has excessive dependency array — `customArtifactData` and `customArtifactTypes` are unstable refs that cause re-render cascade | Performance | Performance reviewer | ✅ Fixed | Moved to refs (`customArtifactTypesRef`, `customArtifactDataRef`) |
| A3 | CustomTypeDesigner action buttons trapped inside scroll container — buttons scroll out of view at 1366x768 on review step | UI Layout | UI visual reviewer | ✅ Fixed | Split modal into pinned header + scrollable body + pinned footer |
| A4 | `persistence.ts:32` comment says "added in v2" but `WORKSPACE_VERSION` was already 2 and wasn't bumped — misleading version history | Fact-check + API Consistency | Fact-check (Incorrect, high confidence) + API consistency | ✅ Fixed | Changed to "optional, backward-compatible addition to v2" |
| A5 | `customArtifact.ts:7` references "cross-session library" that doesn't exist — sets incorrect expectations | Fact-check + API Consistency | Fact-check (Unverifiable) + API consistency | ✅ Fixed | Removed cross-session library reference |
| A6 | Design route (`/api/custom-type/design`) duplicates `handleArtifactRoute` patterns instead of reusing shared infrastructure | API Consistency | API consistency reviewer | ✅ Fixed | Added comment documenting why it diverges (different semantics) |

---

## 🟢 Consider

Advisory findings from contextual critics, single-critic suggestions, and improvement opportunities. Not required to pass review.

| # | Finding | Source |
|---|---|---|
| C1 | User-controlled system prompt becomes a prompt injection vector if workspace sharing is ever added — document the trust assumption | Security |
| C2 | LLM-generated type definitions pass through a two-hop chain without content validation — user review step mitigates | Security |
| C3 | No rate limiting on LLM-calling API routes (pre-existing gap, not introduced by this PR) | Security |
| C4 | Double JSON parse in custom route via `request.clone()` — unnecessary serialization cost (cold path) | Performance |
| C5 | Orphaned `customArtifactData` keys accumulate in localStorage when types are deleted then snapshots restored | Performance |
| C6 | Custom route uses generic `"result"` response key, breaking naming symmetry with built-in routes | API Consistency |
| C7 | `isCustomType("custom-")` matches empty suffix — minor robustness gap | API Consistency |
| C8 | `customArtifactData` split across `artifacts` and top-level in persistence — asymmetric structure | API Consistency |
| C9 | `ARTIFACT_RESPONSE_KEY` comment says "kebab-case -> camelCase" but `semiformal->proof` and `lean->leanCode` aren't case conversions | Fact-check (Mostly Accurate) |
| C10 | `formatLabel` docstring says "camelCase or snake_case" but also handles kebab-case | Fact-check (Mostly Accurate) |
| C11 | ArtifactTypeModal header scrolls away with many custom types (pre-existing, worsened) | UI Visual |
| C12 | `CustomArtifactIcon` SVG paths exceed 20x20 viewBox — may clip | UI Visual |
| C13 | Recursive `JsonSection` has no depth guard for deeply nested LLM output | UI Visual |
| C14 | `page.tsx` god component (780 lines, 57+ memo deps) — highest carrying-cost tech debt item, approaching tipping point | Tech Debt Triage |
| C15 | `useWorkspacePersistence` monolith (327 lines, 25+ exports) — related to C14, should be split alongside | Tech Debt Triage |
| C16 | Custom types silently skip node-level formalization with no UI indication | Tech Debt Triage |
| C17 | No system prompt sanitization beyond length check — acceptable for single-user tool, flag when sharing is added | Tech Debt Triage |
| C18 | High-priority test gaps: `useWorkspacePersistence` CRUD, `useArtifactGeneration` custom routing, custom API route validation | Test Strategy |
| C19 | Medium-priority test gaps: design API route, `usePanelDefinitions` with custom types, `CustomArtifactPanel` rendering | Test Strategy |
| C20 | Systemic gap: no API route tests exist anywhere in the project | Test Strategy |

---

## ✅ Confirmed Good

Patterns, implementations, or claims confirmed correct by fact-check and/or critics.

| Item | Verdict | Source |
|---|---|---|
| Type system extension (`BuiltinArtifactType \| CustomArtifactTypeId`) is clean and well-designed | ✅ Confirmed | API Consistency, Performance |
| `custom-` prefix convention with `isCustomType` guard prevents type confusion | ✅ Confirmed | Fact-check, Security |
| Custom formalization route correctly reuses `handleArtifactRoute` | ✅ Confirmed | API Consistency |
| Persistence is backward-compatible — optional fields with `?? []`/`?? {}` defaults | ✅ Confirmed | Fact-check, API Consistency |
| `isValidCustomTypeDef` defensive validation on localStorage load | ✅ Confirmed | Security, Performance |
| No XSS vectors — React auto-escaping, no `dangerouslySetInnerHTML` | ✅ Confirmed | Security |
| `MAX_SYSTEM_PROMPT_LENGTH` guard (10,000 chars) on custom route | ✅ Confirmed | Security, Performance |
| `transformBody` strips custom fields before `buildUserMessage` | ✅ Confirmed | Security |
| Parallel generation via `Promise.allSettled` — no sequential bottleneck | ✅ Confirmed | Performance |
| Stale selection cleanup via `useEffect` on `customArtifactTypes` | ✅ Confirmed | API Consistency, Performance |
| `updateCustomArtifactType` clears stale data when system prompt changes | ✅ Confirmed | Performance |
| `ARTIFACT_META` keyed by `BuiltinArtifactType` with entry for every member | ✅ Confirmed | Fact-check |
| `SELECTABLE_ARTIFACT_TYPES` correctly excludes `lean` (deductive pipeline only) | ✅ Confirmed | Fact-check |
| `ARTIFACT_ROUTE` is `Partial<Record>` — semiformal and lean correctly absent | ✅ Confirmed | Fact-check |
| Request cloning in custom route handles body stream correctly | ✅ Confirmed | Security, Fact-check |
| Custom types return `null` from `formalizeNode` (intentional scope boundary) | ✅ Confirmed | Fact-check |

---

To pass review: all 🔴 items must be resolved. All 🟡 items must be either fixed or carry an author note. 🟢 items are optional.
