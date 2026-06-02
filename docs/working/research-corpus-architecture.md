# Research: Artifact corpus architecture (DD-009 implementation)

- **Goal**: Understand the current persistence and session subsystems well enough to implement DD-009's corpus architecture — OPFS-cached local working copy, user-picked FSA folder + user-configured git remote as the source of truth — replacing the localStorage-only model.
- **Problem framing**: The user's body of generated work is treated as incidentally-serialized in-memory state across three fragmented localStorage stores, which structurally permits categories of data (custom types, version history) to drift apart and be silently lost on session switch. Considered and discarded: "the custom-type session-bleed is a bug in the snapshot bridge" — true but DD-009 Diamond 1 explicitly reframed the bridge bug as a symptom of the persistence model, not the disease; planning a bridge patch would re-litigate a settled framing decision.
- **Project state**: This branch (`feat/corpus-architecture`) delivers the DD-009 implementation research+plan; it carries the decision record and both perf spikes merged from their doc branches · sits downstream of the two completed iso-git spikes, standalone otherwise · not blocked (both spikes returned proceed-to-RPI) (cite: docs/decisions/009-artifact-corpus-architecture.md).
- **Task status**: in-progress (research drafted; plan scope/phasing to be confirmed with user before plan is written)

## What exists

### The three+ fragmented persistence stores
The app persists to **five** distinct localStorage keys, each with its own debounced adapter and no cross-store sync — the structural condition DD-009 targets:

1. **`workspace-zustand-v1`** — the main Zustand store (`app/lib/stores/workspaceStore.ts:526`). Holds live `WorkspaceState`: sources, semiformal/lean, versioned `artifacts` (`ArtifactRecord.versions[]`), decomposition, and `customArtifactTypes`/`customArtifactData`. Debounced 300ms writes (`createDebouncedStorage`, workspaceStore.ts:31-56). `skipHydration: true` for SSR; hydrates via `rehydrate()` in a `useEffect`. [observed]
2. **`workspace-sessions-v1`** — workspace-session index + every frozen per-session `PersistedWorkspace` blob (`app/hooks/useWorkspaceSessions.ts`, key in `app/lib/types/workspaceSession.ts:4`). Debounced 500ms; auto-saves the active session every 5s. [observed]
3. **`metaformalism-sessions`** — per-scope (global or per-decomposition-node) formalization session history (`app/hooks/useFormalizationSessions.ts:10`). Frozen *inside* each `WorkspaceSession` too. [observed]
4. **`evidence-store-v1`** — evidence-search results, `slots` only (`app/lib/stores/evidenceStore.ts`). [observed]
5. **`workspace-v2`** (legacy `PersistedWorkspace`) — read-only migration source; `migrateFromV2()` pulls it into the Zustand store on first load if the Zustand key is absent (workspaceStore.ts:282-316, 556-571). `workspace-v1` auto-migrates to v2 (`app/lib/utils/workspacePersistence.ts:10-31`). [observed]

### The lossy session-snapshot bridge (the bug's mechanism)
Workspace-session switching does **not** use the Zustand store's own `getSnapshot`/`resetToSnapshot` (workspaceStore.ts:503-521, which *do* include custom types). It uses a **separate, lossy bridge** in `app/page.tsx`:

- `getWorkspaceSnapshot()` (page.tsx:124-143) builds a `PersistedWorkspace` (version 2) and **omits** `customArtifactTypes`/`customArtifactData` entirely, and calls `s.getArtifactContent(key)` per artifact — returning **only the current version's content**, flattening `versions[]`. [observed]
- `resetWorkspaceToSnapshot()` (page.tsx:145-173) rebuilds each artifact as a single-version record and `setState`s a field set that **omits** `customArtifactTypes`/`customArtifactData`. Because Zustand `setState` is a partial merge, those keys are left untouched → custom-type *definitions leak across sessions*; generated *content* is dropped because nothing carries it through the blob. [observed]
- Note: `PersistedWorkspace` (persistence.ts:16-37) *declares* optional `customArtifactTypes?`/`customArtifactData?` fields, and `workspacePersistence.ts` save/load round-trips them (tested, workspacePersistence.test.ts:345-403). So the type and the standalone persistence util support custom types — **the page.tsx bridge is the only place that drops them.** [observed] DD-009 §Context cites `page.tsx:135-184`; the line numbers have drifted to 124-173 but the analysis is exactly correct.

### Sessions
- **Workspace sessions** (`useWorkspaceSessions.ts`): `WorkspaceSession` = `{id, title, createdAt, updatedAt, workspace: PersistedWorkspace, sessions: SessionsState}` (workspaceSession.ts:6-18). `createNewSession` clears workspace + cancels auto-formalize queue; `switchToSession` saves current then restores target via the bridge above; `saveCurrentSession` auto-runs every 5s. `useSyncExternalStore` for SSR safety. [observed]
- **Formalization sessions** (`useFormalizationSessions.ts`): scope-based (`{type:"global"}` | `{type:"node", nodeId}`), multiple runs per scope (`runNumber`), per-artifact-type `artifacts[]`. Restored into global/per-node state via an `onRestore` callback. [observed]

### Source documents
Uploaded files (`FileUpload.tsx`, `.txt/.md/.tex/.docx/.pdf`) are extracted to **text only** via `fileExtraction.ts` (pdfjs-dist for PDF, mammoth for docx). `extractedFiles: {name, text}[]` — **raw PDF bytes are never persisted today.** [observed] DD-009's folder layout has a `sources/<id>.{txt,pdf,...}` directory; storing raw source bytes is *new* behavior the corpus introduces, and is the origin of the spike's 50–100MB sizing assumption. [inferred]

### Dependencies / stack
Next.js `^16.2.6`, React `19.2.6`, Zustand `^5.0.13`, pdfjs-dist `^5.7.284`, mammoth `^1.12.0`. Vitest `^4.1.6` + jsdom + Testing Library. **`isomorphic-git` and any OPFS/FSA adapter are NOT installed.** [observed]

## Invariants (must not break)

- **SSR safety**: every persisted store renders defaults on the server and hydrates in a `useEffect` (`skipHydration`/`useSyncExternalStore`). Any new corpus adapter must not touch `window`/OPFS during render or it will throw on the server and break hydration. [observed — workspaceStore.ts:529, useWorkspaceSessions.ts:75-77]
- **Transient-state sanitization on persist**: `verificationStatus: "verifying"` → `"none"` and node `"in-progress"` → `"unverified"` before any write, so a reload mid-verify isn't stuck (workspaceStore.ts:548, workspacePersistence.ts; tests at workspacePersistence.test.ts:87-116, workspaceStore-hydration.test.ts:88-99). [observed]
- **`getArtifactContent(key)` returns current-version content** and `MAX_VERSIONS` caps history; undo/redo depends on `currentVersionIndex` semantics (workspaceStore.ts:371-466). The corpus must preserve undo/redo. [observed]
- **Migration must be additive and lossless**: v1→v2→zustand chains already exist and are tested (workspaceStore-hydration.test.ts:102-195). A corpus migration must back up before deleting (DD-009 §Consequences) and must not silently drop the four other stores. [observed]
- **Vercel single-tenant, no durable server FS**: per repo CLAUDE.md, only `/tmp` is writable and only warm; persistence must stay client-side (OPFS/FSA/remote-git), not server filesystem. [observed — meta-formalism-copilot/CLAUDE.md Deployment §]
- **`PersistedWorkspace` is a consumed contract**: `workspacePersistence.ts`, the session blob, and example-workspace.json all depend on its shape; changing it ripples into the export feature and docs. [observed]

## Prior art

- **Zustand `persist` middleware** already abstracts a storage backend behind `getItem/setItem/removeItem` (`createDebouncedStorage`). An OPFS/corpus adapter can plug into the *same* interface for the Zustand store, which is the cheapest integration seam — though DD-009 wants files-per-artifact, not one JSON blob, so the adapter is more than a drop-in. [observed]
- **Existing migration scaffolding** (`migrateFromV2`, `migrateV1Workspace`) is the pattern to follow for the localStorage→corpus one-shot conversion (back up old keys, convert, mark done). [observed]
- **`docs/thoughts/page-tsx-refactor.md`** documents that page.tsx historically concentrated session wiring and that pipeline config callbacks suffer stale-closure bugs — relevant because the corpus write-path will add async callbacks; use refs/current-value passing, not closed-over state. [observed]
- **`docs/thoughts/isomorphic-git-perf-characteristics.md`** is the distilled perf baseline from both spikes — the load-pagination and write-debounce numbers the plan must honor. [observed]

## Gotchas

Failure-pattern grep: no matches found (docs/thoughts/failure-patterns.md does not exist in this repo)

- **iso-git UMD requires `globalThis.Buffer`** — Next.js needs the `buffer` polyfill wired via Webpack 5 `fallback` config; not on by default. Cost ~10 min of confusing debug if missed (browser smoke spike §Updates). [observed]
- **`git.log({filepath})` is O(commits-touching-file)** and crosses the 5s budget around ~3000 per-file commits on Chromium (~12s Firefox). Version-history UI must use `depth` + cursor pagination, never an eager full `log` on mount (both spikes; perf-characteristics §scaling cliff). [observed]
- **IndexedDB/OPFS "write completed" ≠ persisted to disk** — the 45MB build returned in 92ms because the transaction committed, not because bytes were fsynced. The "saved" indicator must reflect the FSA-mirror/remote-push ack, not the OPFS write ack (browser smoke spike narrative #4). [observed]
- **Two snapshot mechanisms exist** (store-level `getSnapshot` vs page.tsx bridge). A naive "just call the store snapshot in sessions" fix is *not* the DD-009 plan, but it's a tempting wrong turn — note it so the plan doesn't accidentally reintroduce the blob model. [observed]
- **Spike numbers are Node + IndexedDB-lightning-fs upper bounds; OPFS + Safari are unmeasured.** Safari/WebKit is the one axis that could still approach failure thresholds; DD-009's perf revisit triggers stay live (perf-characteristics §what's-not-measured). [observed]
- **Background-tab throttling** (Chromium ~1Hz after 5 min) means autosave cadence in a backgrounded workspace is far worse than spike measurements. [observed]
- **`extractedFiles` carries a non-serializable `File?` field** stripped by JSON.stringify today (workspaceStore.ts:538). The corpus, which *does* store source bytes, changes this contract. [observed]

## Open design questions for the plan

- DD-009 is a ~250–320h / 6–8 week effort spanning ≥5 subsystems (FS abstraction, OPFS adapter, FSA UX, iso-git pipeline, data-model/folder migration, four failure-driven UI states). This almost certainly wants `workflows/task-decomposition.md` and a **phased** RPI rather than one plan. The DD-009 implementation handoff suggests: (1) spike [done], (2) OPFS+FSA mirror layer in isolation before git, (3) migration design. The plan scope/phasing is the next decision (see chat).
- Whether to keep the Zustand `persist` blob seam (adapter swaps localStorage→OPFS-as-one-blob first, files-per-artifact later) or go straight to the folder layout. Affects step ordering and migration shape.

## Files read
Last verified: 2026-06-01
docs/decisions/009-artifact-corpus-architecture.md
docs/spikes/isomorphic-git-perf-50mb.md
docs/spikes/iso-git-browser-smoke.md
docs/thoughts/isomorphic-git-perf-characteristics.md
docs/thoughts/page-tsx-refactor.md
app/page.tsx
app/lib/stores/workspaceStore.ts
app/lib/stores/evidenceStore.ts
app/lib/types/persistence.ts
app/lib/types/workspaceSession.ts
app/lib/types/session.ts
app/lib/types/customArtifact.ts
app/lib/utils/workspacePersistence.ts
app/lib/utils/workspacePersistence.test.ts
app/lib/utils/fileExtraction.ts
app/lib/stores/__tests__/workspaceStore-hydration.test.ts
app/hooks/useWorkspaceSessions.ts
app/hooks/useFormalizationSessions.ts
app/components/features/source-input/FileUpload.tsx
package.json
meta-formalism-copilot/CLAUDE.md
