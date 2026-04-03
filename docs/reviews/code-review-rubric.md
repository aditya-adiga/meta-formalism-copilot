# Code Review Rubric

**Scope:** `feat/graph-persistence-editing` vs `main` (86 files, +6679/-1615) | **Reviewed:** 2026-04-03 (Loop 2) | **Status: 🟡 CONDITIONAL PASS** — 0 red items, 2 amber item(s) awaiting resolution or justification

---

## 🔴 Must Fix

Issues that must be resolved before merge. Draft cannot pass review with any red items unresolved.

| # | Finding | Domain | Location | Status |
|---|---|---|---|---|
| R1 | Throttle utility drops trailing-edge calls instead of delivering the latest — causes choppy streaming previews and comment is inaccurate | Performance + Fact-Check (convergence, escalated from 🟡) | `app/lib/utils/throttle.ts:19-25` | ✅ Resolved — stores latest args in pendingArgs |
| R2 | Lean route's custom TransformStream re-parses own SSE with fragile chunk-boundary assumptions, diverges from all other routes | Security + API Consistency (convergence, escalated from 🟡) | `app/api/formalization/lean/route.ts:100-138` | ✅ Resolved — replaced with streamLlm transformFinalText callback |
| R3 | Dead `useAllArtifactEditing` function (never called) with docstring referencing deleted `useWorkspacePersistence` | Fact-Check (Incorrect, high confidence) + API Consistency + Tech Debt | `app/hooks/useArtifactEditing.ts:69-115` | ✅ Resolved — deleted |
| R4 | CLAUDE.md references deleted `useWorkspacePersistence` hook and has incomplete panel list | Fact-Check (Stale) + API Consistency (convergence, escalated from 🟡) | `CLAUDE.md:29,37,48` | ✅ Resolved — updated to Zustand store, added missing panels |
| R5 | Duplicate decision doc numbering — two `005-*` files | Fact-Check (Mostly Accurate) + API Consistency (convergence, escalated from 🟡) | `docs/decisions/005-*.md` | ✅ Resolved — renamed to 006 |

---

## 🟡 Must Address

Issues that must be fixed or acknowledged by the author with justification for why they stand. Each must carry a resolution or author note.

| # | Finding | Domain | Source | Status | Author note |
|---|---|---|---|---|---|
| A1 | No request body size limits on API routes — oversized POST can exhaust memory before LLM token limit | Security | Security (Medium) | 🟡 Open | Single-user research tool; Next.js has default 1MB body limit. Acceptable risk for now. |
| A2 | `edit/artifact` returns `{ text }` for inline but `{ content }` for whole edits — inconsistent with existing edit routes that always return `{ text }` | API Consistency | API Consistency (Inconsistent) | ✅ Resolved | Unified to `{ text }` in all paths |
| A3 | Workspace auto-save runs `structuredClone` + `JSON.stringify` every 5s unconditionally even when idle — add dirty flag | Performance | Performance (Medium) | ✅ Resolved | Added lastSavedSnapshotRef dirty check |
| A4 | Dagre layout hook rebuilds ReactFlow node/edge arrays on every streaming preview update (~20/sec during generation) | Performance | Performance (Medium) | 🟡 Open | Bounded by 50ms throttle; incremental Dagre only runs for new nodes. Acceptable for current graph sizes (<50 nodes). |
| A5 | Incomplete dialectical-map→balanced-perspectives rename: onboarding overlay says "Dialectical Map", API prompt says "dialectical analyst" | Naming | Tech Debt + API Consistency | ✅ Resolved | Updated both strings |

---

## 🟢 Consider

Advisory findings from contextual critics, single-critic suggestions, and improvement opportunities. Not required to pass review.

| # | Finding | Source |
|---|---|---|
| C1 | LLM response fragments leaked in 502 error responses (defense-in-depth) | Security |
| C2 | Committed `data/analytics.jsonl` reveals infrastructure details — remove or document | Security |
| C3 | OpenRouter API key has full account access — set spending limits | Security |
| C4 | Inline edit offset TOCTOU if content changes during API call | Security |
| C5 | Anthropic client singleton ignores key rotation — document restart requirement | Security |
| C6 | `SIMULATE_STREAM_FROM_CACHE` available in production — guard with NODE_ENV check | Security |
| C7 | `storeArtifactResults` does linear scan + unbatched `updateNode` per artifact type | Performance |
| C8 | `EditableSection` runs `JSON.stringify` on every render for change detection | Performance |
| C9 | `handleRestoreSession` calls `setArtifactGenerated` per-artifact instead of batching | Performance |
| C10 | `edit/artifact` uses `content` instead of `fullText` for input — diverges from existing edit routes | API Consistency |
| C11 | Lean route lacks input validation for `informalProof` (pre-existing, widened by streaming) | API Consistency |
| C12 | Add tests for `stripCodeFences`, `throttle`, `useFieldUpdaters`, `useArtifactEditing`, rehydration validation (~2.5h for high-priority items) | Test Strategy |
| C13 | Extract duplicated `recordAndCache` from `callLlm.ts`/`streamLlm.ts` into shared module | Tech Debt |
| C14 | `PersistedWorkspace` bridge layer discards version history on session switch | Tech Debt |
| C15 | Dual localStorage keys (`workspace-v2` + `workspace-zustand-v1`) without cleanup after migration | Tech Debt |
| C16 | `EditableSection` makes direct API calls instead of receiving callbacks from hooks | Tech Debt |
| C17 | Dead `saveWorkspace`/`SaveWorkspaceInput`/`ArtifactPersistenceData` exports in `workspacePersistence.ts` | Tech Debt |
| C18 | All dependency changes are safe — no action items | Dependency Upgrade |

---

## ✅ Confirmed Good

Patterns, implementations, or claims confirmed correct by fact-check and/or critics.

| Item | Verdict | Source |
|---|---|---|
| Zustand store replaces `useWorkspacePersistence` correctly | ✅ Confirmed | Fact-Check |
| Persist middleware with debounced storage adapter at 300ms | ✅ Confirmed | Fact-Check + Performance |
| `skipHydration: true` with explicit rehydrate in useEffect | ✅ Confirmed | Fact-Check + Performance |
| `partialize` excludes action functions from persistence | ✅ Confirmed | Fact-Check |
| Semiformal/lean kept as flat strings for pipeline compatibility | ✅ Confirmed | Fact-Check |
| Provider chain Anthropic→OpenRouter→mock consistent across streaming and non-streaming | ✅ Confirmed | Fact-Check |
| Cache hits emit single done event | ✅ Confirmed | Fact-Check |
| API keys never logged, returned, or written to cache/analytics | ✅ Confirmed | Security |
| SHA-256 cache keys prevent path traversal | ✅ Confirmed | Security |
| JSON parse validation on whole-edit LLM responses | ✅ Confirmed | Security |
| Thorough deserialization validation via coerce* functions | ✅ Confirmed | Security |
| SSE encoding uses JSON.stringify preventing injection | ✅ Confirmed | Security |
| No `dangerouslySetInnerHTML` — React auto-escaping throughout | ✅ Confirmed | Security |
| `sanitizeDecomposition` memoization eliminates per-keystroke bottleneck | ✅ Confirmed | Performance |
| Streaming preview kept outside Zustand store (transient state) | ✅ Confirmed | Performance |
| Stable module-level selector functions avoid re-render churn | ✅ Confirmed | Performance |
| `setArtifactsBatchGenerated` correctly batches multiple artifacts | ✅ Confirmed | Performance |
| Incremental Dagre layout — only runs for new nodes | ✅ Confirmed | Performance |
| Version capping at MAX_VERSIONS=20 bounds storage | ✅ Confirmed | Fact-Check + Performance |
| `ArtifactGenerationRequest` uniform contract across formalization routes | ✅ Confirmed | API Consistency |
| SSE protocol consistent (token/done/error) across all streaming routes | ✅ Confirmed | API Consistency |
| Error handling follows `{ error, details? }` pattern with correct status codes | ✅ Confirmed | API Consistency |
| `useFieldUpdaters` centralizes spread-serialize pattern cleanly | ✅ Confirmed | API Consistency |
| Zustand store's versioned artifact API is symmetric and well-typed | ✅ Confirmed | API Consistency |
| All dependency changes safe — zustand, partial-json justified; all upgrades routine | ✅ Confirmed | Dependency Upgrade |

---

To pass review: all 🔴 items must be resolved. All 🟡 items must be either fixed or carry an author note. 🟢 items are optional.
