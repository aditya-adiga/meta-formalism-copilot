# Code Review Rubric

**Scope:** `feat/zustand-wire-page` vs `main` (19 files, ~2600 additions, ~450 deletions) | **Reviewed:** 2026-04-03 (Loop 3) | **Status: 🟡 CONDITIONAL PASS** — 0 red items, 1 amber item acknowledged

---

## 🔴 Must Fix

No red items.

---

## 🟡 Must Address

| # | Finding | Domain | Source | Status | Author note |
|---|---|---|---|---|---|
| A1 | `coerceArtifactRecord` does not validate individual `ArtifactVersion` fields | Security + API | Convergence (escalated) | ✅ Fixed | Added `coerceArtifactVersion` with field-level validation (3ed18f8) |
| A2 | Node coercion uses spread+cast instead of field-by-field validation | API Consistency | API F2 (Inconsistent) | ✅ Fixed | Now reuses `coerceDecomposition` from workspacePersistence (3ed18f8) |
| A3 | Snapshot type asymmetry: store returns `WorkspaceState` but sessions expect `PersistedWorkspace` | API Consistency | API F1 (Inconsistent) | 🟡 Acknowledged | Intentional bridge — resolves when `useWorkspaceSessions` consumes `WorkspaceState` directly |
| A4 | `GenerationProvenance` type defined but unused | 3-critic convergence | Escalated from Consider | ✅ Fixed | Removed (3ed18f8) |
| A5 | `migrateFromV2` uses individual setters instead of batch `setState` | Perf + API convergence | Escalated from Consider | ✅ Fixed | Single `setState` call (3ed18f8) |
| A6 | `partialize` maps decomposition nodes on every `set()` call | Performance | Perf F1 (Medium) | ✅ Fixed | Added `sanitizeDecomposition` memoization (3ed18f8) |
| A7 | `storeArtifactResults` triggers N separate `set()` calls | Performance | Perf F2 (Medium) | ✅ Fixed | Uses `setArtifactsBatchGenerated` store action (3ed18f8, 6b5a801) |
| A8 | Comment "persist middleware replaces manual debounce" imprecise | Fact-check | Claim 2 (Mostly Accurate) | ✅ Fixed | Comment updated (3ed18f8) |
| A9 | Comment "mirrors the defensive coercion" imprecise | Fact-check | Claim 9 (Mostly Accurate) | ✅ Fixed | Comment updated (3ed18f8) |
| A10 | Comment "stable references — never trigger re-renders" imprecise | Fact-check | Claim 15 (Mostly Accurate) | ✅ Fixed | Comment updated (3ed18f8) |

---

## 🟢 Consider

| # | Finding | Source |
|---|---|---|
| C1 | `resetToSnapshot` applies data without internal sanitization | Security (Low) |
| C2 | Debounced writes can lose last ~300ms on tab close | Security (Low) |
| C3 | 21 selector subscriptions in `page.tsx` — consider grouping if count grows | Performance (Low) |
| C4 | Double `JSON.stringify` of artifact results in `storeArtifactResults` | Performance (Low) |
| C5 | `file?: File` silently dropped on snapshot/persist | API Consistency (Minor) |
| C6 | Hardcoded `validKeys` array duplicates `ArtifactKey` type | API Consistency (Minor) |
| C7 | `handleRestoreSession` still calls `setArtifactGenerated` individually (low frequency) | Performance (Low, new Loop 2) |
| C8 | `isObject` helper duplicated in workspaceStore.ts and workspacePersistence.ts | Tech Debt |
| C9 | Test: `coerceArtifactVersion` field-level validation (new, High priority) | Test Strategy |
| C10 | Test: `resolveArtifactContent` edge cases | Test Strategy |
| C11 | Test: undo/redo no-ops at boundaries | Test Strategy |
| C12 | Test: `onRehydrateStorage` auto-migration path | Test Strategy |
| C13 | Test: snapshot bridge round-trip | Test Strategy |
| C14 | Dead code: `saveWorkspace` in `workspacePersistence.ts` | Tech Debt |
| C15 | Dual localStorage keys coexist indefinitely | Tech Debt |
| C16 | `page.tsx` remains 500-line orchestrator | Tech Debt |
| C17 | `resetWorkspaceToSnapshot` discards version history (known, not a regression) | Tech Debt |

---

## ✅ Confirmed Good

| Item | Verdict | Source |
|---|---|---|
| Zustand `persist` with `skipHydration` for SSR safety | ✅ Confirmed | Fact-check, Security, Performance |
| `partialize` excludes actions, sanitizes verification status | ✅ Confirmed | Fact-check, Security |
| `partialize` decomposition mapping memoized via reference equality | ✅ Confirmed | Performance (Loop 2) |
| Artifact version cap at MAX_VERSIONS = 20 | ✅ Confirmed | Fact-check, Performance |
| `getState()` for async pipeline callbacks avoids stale closures | ✅ Confirmed | Fact-check, Performance |
| Batched `setState` in `resetWorkspaceToSnapshot` and `migrateFromV2` | ✅ Confirmed | Performance (Loop 2) |
| `setArtifactsBatchGenerated` centralizes version-building logic | ✅ Confirmed | Perf + API (Loop 3) |
| Debounced storage adapter (300ms, quota handling) | ✅ Confirmed | Fact-check, Security, Performance |
| `structuredClone` deep copy in snapshots | ✅ Confirmed | Security, Performance |
| Module-scope artifact selectors prevent identity churn | ✅ Confirmed | Performance |
| Zustand ^5.0.12 well-justified, dual-version safe with ReactFlow | ✅ Confirmed | Dependency Upgrade |
| `coerceArtifactVersion` validates all fields during rehydration | ✅ Confirmed | Security + API (Loop 2) |
| `coerceDecomposition` shared between store and persistence | ✅ Confirmed | API Consistency (Loop 2) |
| All 25 fact-check claims verified, 0 issues | ✅ Confirmed | Fact-check (Loop 2) |

---

To pass review: all 🔴 items must be resolved. All 🟡 items must be either fixed or carry an author note. 🟢 items are optional.
