# Decomposition: DD-009 Artifact corpus architecture

Per `workflows/task-decomposition.md`. This splits DD-009's ~250–320h implementation into independent sub-tasks, each of which becomes its own RPI loop. Research is shared and already complete in `docs/working/research-corpus-architecture.md` (the shared-dependency research per step 2) — no parallel research sub-agents were dispatched because the whole persistence surface was mapped in one pass; this doc is the implementation decomposition + interface contracts + coverage check.

## Original goal (verbatim)

User request: *"start rpi for decision 009 given the results of the two spikes"*

DD-009 Goal (the decision being implemented): *"Decide how the user's body of generated work (every artifact, every version, every custom artifact type definition) is persisted and synchronized, replacing the current localStorage-only model in which session switching silently erases custom artifact type references and flattens per-panel version histories."*

Chosen architecture (DD-009 #4'): OPFS as transparent local cache; user-picked FSA folder + user-configured git remote as the corpus (source of truth). Degraded modes: OPFS-only (no FSA), FSA-no-remote (local-only), full.

## Sub-tasks (independent implementation workstreams)

Labeled by whether each is foundational (blocks others), independent, or cross-cutting.

- **S0 — Folder layout + manifest schema + `CorpusFS` interface design** *(shared dependency / foundational)*. Settle the on-disk shape (DD-009 §Folder layout, refined to a concrete schema), the `workspace.json` manifest, the per-version artifact-file + `meta.json` provenance convention, and the `CorpusFS` read/write/list/log interface that every adapter and consumer binds to. No runtime code beyond type definitions and a schema doc. Everything else reads/writes through these contracts, so they must be settled first. *This is folded into the S1 plan as its first steps rather than a standalone loop.*

- **S1 — OPFS adapter implementing `CorpusFS`** *(foundational impl)*. The always-on local working copy: an OPFS-backed implementation of `CorpusFS`, wired so the workspace store reads/writes through it behind a feature flag while localStorage stays the default. Characterization tests lock current localStorage round-trip behavior first. **Blocks S2, S3, S4.** This is the first RPI loop (DD-009 handoff step 2, OPFS portion).

- **S2 — FSA folder mirror + folder-pick UX** *(depends on S1)*. Opt-in user-visible source-of-truth folder: the folder-pick flow, FSA permission handling, and the async OPFS→FSA mirror with retry. Read-path fallthrough (OPFS empty → read from FSA) for browser-storage-clear recovery.

- **S3 — isomorphic-git commit/push pipeline** *(depends on S0 layout + S1)*. A git working tree inside the corpus: commit-on-write, push/pull-on-sync with backoff, running in a dedicated worker so iso-git CPU bursts stay off the main thread. Carries the iso-git spike invariants (Buffer polyfill, lazy-paginated `git.log`, worker error reification).

- **S4 — Data-model migration + session model rewrite** *(depends on S0 layout + S1; integrates S2/S3)*. Replace the lossy `page.tsx` session-snapshot bridge (page.tsx:124-173) with folder/ref-based session switching, so custom-type bleed and version-history flattening become structurally impossible. One-shot localStorage→corpus migration that backs up the five old keys before deleting. Fold the four other stores (`workspace-sessions-v1`, `metaformalism-sessions`, `evidence-store-v1`, legacy `workspace-v2`) into the corpus.

- **S5 — Failure-driven corpus-status UI + `CorpusWorkerError`** *(cross-cutting; lands incrementally with S1–S4)*. The typed `CorpusWorkerError` discriminated union (one variant per failure-driven UI state) with a TS exhaustiveness check, and the "corpus status" UI element with ≥4 explicit states: FSA-permission-revoked, OPFS-quota-warning, remote-auth-expired, browser-storage-cleared (FSA-mirror intact). DD-009 §Failure-driven mitigation disallows silent fallback. Each of S1–S4 contributes its failure variants.

## Implementation order

`S0 → S1 → [S2, S3] → S4`, with **S5 cross-cutting** (each of S1–S4 adds its failure variants and status states as it lands).

Reading: S0 (contracts) and S1 (OPFS adapter) are sequential and foundational. Once `CorpusFS` exists, S2 (FSA mirror) and S3 (git pipeline) are largely independent and can proceed in either order or in parallel. S4 (migration + session rewrite) depends on the folder layout (S0) and the adapter (S1) and integrates whatever of S2/S3 has landed. S5 is not a phase — its error-union and status-UI scaffolding is introduced in S1 and extended by each subsequent sub-task.

## Interface contracts

These shapes cross sub-task boundaries; they are the predictions the per-sub-task RPI loops must verify against the code they produce.

> **Interface: `CorpusFS` — the FS abstraction every adapter/consumer binds to** (S0 defines; S1 implements; S2/S3/S4 consume)
> (a) Shape: an async interface roughly `{ readFile(path): Promise<Uint8Array|null>; writeFile(path, bytes): Promise<void>; readdir(path): Promise<string[]>; rm(path): Promise<void>; stat(path): Promise<{size:number}|null> }` — bytes-oriented (sources are binary PDFs), path-oriented, async (OPFS and FSA are both async). Concrete signatures finalized in S0.
> (b) Error mode: rejects with a typed `CorpusError` (the non-worker sibling of `CorpusWorkerError`); never returns `undefined` for "not found" — `readFile`/`stat` return `null`, everything else rejects.
> (c) Codebase example: the closest existing seam is Zustand's `{getItem,setItem,removeItem}` storage adapter (`app/lib/stores/workspaceStore.ts:31-56`) — synchronous and string-blob-oriented; `CorpusFS` is its async, bytes-and-paths successor.

> **Interface: Folder layout + `workspace.json` manifest** (S0 defines; S1/S2/S3/S4 read/write through it)
> (a) Shape: `<corpus-root>/workspaces/<slug>/{workspace.json, sources/<id>.<ext>, artifacts/<type>/v####.md + meta.json, custom-types/<id>.json, decomposition/...}` + top-level `settings.json` (DD-009 §Folder layout). `workspace.json` manifest lists sources, panels, and current-version pointers per artifact.
> (b) Error mode: a malformed/absent `workspace.json` surfaces as a `browser-storage-cleared`-class recovery path (read from FSA, or fail to the corpus-status UI), never a silent default-to-empty that would mask data loss.
> (c) Codebase example: today's flat `PersistedWorkspace` blob (`app/lib/types/persistence.ts:16-37`) is what the manifest+files replace; the per-version files replace `ArtifactRecord.versions[]` (`app/lib/stores/workspaceStore.ts:84-96`).

> **Interface: `CorpusWorkerError` discriminated union** (S5 defines; S1/S3 raise from the worker)
> (a) Shape: `type CorpusWorkerError = { kind: "fsa-permission-revoked" } | { kind: "opfs-quota-exceeded"; needed:number; available:number } | { kind: "remote-auth-expired" } | { kind: "browser-storage-cleared" } | { kind: "git-conflict"; path:string } | ...` — one `kind` per failure-driven UI state, with a TS exhaustiveness `switch`.
> (b) Error mode: every worker `postMessage` failure path reifies into one of these `kind`s; the main thread maps `kind` → corpus-status UI state. No untyped throws cross the worker boundary (DD-009 §Failure-driven: silent fallback disallowed).
> (c) Codebase example: no precedent — the current `createDebouncedStorage` swallows quota errors with `console.warn` (`app/lib/stores/workspaceStore.ts:44-46`), which is exactly the silent-degradation DD-009 forbids and S5 replaces.

> **Interface: sync-ack signal driving the "saved" indicator** (S5 defines the state; S2/S3 emit acks)
> (a) Shape: the "saved" indicator state is derived from the FSA-mirror enqueue-ack (S2) and remote-push-ack (S3), NOT from the OPFS write-ack — because IndexedDB/OPFS "write completed" ≠ bytes-on-disk (research Gotchas; browser smoke spike narrative #4).
> (b) Error mode: a stale/failed mirror or push downgrades the indicator to "saved locally — corpus folder not connected" (DD-009 failure narrative #4), never a green "saved".
> (c) Codebase example: no current equivalent — today there is no save indicator; localStorage writes are fire-and-forget.

## Reconciliation

No parallel sub-agents were dispatched (the shared research was done in one main-agent pass), so there are no conflicting sub-investigation findings to reconcile. The four interface contracts above were derived from a single consistent reading of the code and DD-009; each cites a ground-truth file:line (or explicitly notes "no precedent"). They will be re-verified inside each sub-task's RPI loop as that sub-task implements against them. Escape line does **not** apply — the sub-tasks share four real interfaces, listed above.

## Coverage check

Mapping every element of DD-009's chosen architecture + consequences to the sub-task(s) that deliver it.

| DD-009 element | Covered by |
|---|---|
| OPFS always-on local working copy | S1 |
| User-picked FSA folder = user-visible source of truth | S2 |
| User-configured git remote = cross-device sync | S3 |
| Read path: OPFS-first, fall through to FSA | S1 (OPFS read) + S2 (FSA fallthrough) |
| Write path: OPFS sync, async FSA mirror w/ retry, async push w/ backoff | S1 (OPFS) + S2 (mirror) + S3 (push) |
| Degraded modes (OPFS-only / FSA-no-remote / full) share one code path | S1 + S2 + S3 (terminal-stage gating); validated in S4 integration |
| Folder layout (workspace.json, per-version files, custom-types, decomposition) | S0 (design) + S4 (full population/migration) |
| Custom-type bleed becomes structurally impossible | S4 (replaces page.tsx bridge) |
| Version history is a corpus property, not in-memory state | S0 (per-version files) + S4 (migration off ArtifactRecord flattening) |
| External tooling (`git log`/`grep`/`vim`) works on the corpus | S0 (files-on-disk layout) + S3 (git) |
| Custom-type definitions versioned alongside outputs | S0 (`custom-types/<id>.json` in git) + S3 |
| `(repo-url, sha, path)` citability (F8 side-effect) | S3 |
| localStorage→corpus migration backs up before delete | S4 |
| Fold the 5 fragmented stores into one corpus | S4 |
| Four+ explicit failure-driven UI states; no silent fallback | S5 |
| Typed `CorpusWorkerError` union w/ exhaustiveness check | S5 |
| OPFS-writer runs in a dedicated worker | S1 (worker scaffold) + S3 (git in worker) |
| Lazy-paginated `git.log` (avoid 3000-commit cliff) | S3 |
| iso-git `buffer` polyfill via Next.js Webpack config | S1 (build wiring, needed before any iso-git import) or S3 — assign in S1 plan |
| Conflict resolution: per-file last-write-wins + warning (v1) | S3 (+ S5 warning state) |
| Perf revisit triggers (Safari, >50MB, cold-start p95) | acknowledged ongoing; not a build sub-task — DD-009 §Revisit triggers + perf-characteristics thoughts doc track these |

**Gaps:** none silently dropped. Two elements are explicitly scoped as *ongoing monitoring* rather than build sub-tasks: the perf revisit triggers (tracked in DD-009 + the perf-characteristics thoughts doc) and the Safari/OPFS spike-validation extension (a pre-launch verification gate, not a pre-RPI gate per the browser smoke spike). Both are acknowledged, not absent.

## Next step

First RPI loop plans **S0+S1** together (the `CorpusFS` interface + folder/manifest contract design, then the OPFS adapter behind a feature flag, with characterization tests). Plan doc: `docs/working/plan-corpus-s1.md`.
