# The corpus FS seam (DD-009 S1 + S3) — notes for S2–S5

Last verified: 2026-06-01
Relevant paths: app/lib/corpus/, app/lib/stores/storeAdapter (corpus/storeAdapter.ts), docs/decisions/009-artifact-corpus-architecture.md, docs/working/decomposition-corpus-architecture.md

What S1 (the `CorpusFS` core) and S3 (the `CorpusGit` git pipeline) built and the contracts later sub-tasks must hold to. (S2's FSA-mirror notes live on the S2 branch; S3 was developed in parallel off S1, not off S2.)

## The module (`app/lib/corpus/`)

- `types.ts` — `CorpusFS` (async, bytes+paths) + the single `CorpusErrorKind` source of truth feeding `CorpusError` (thrown) and `CorpusWorkerError` (postMessage-serializable). `assertNever` enforces exhaustive handling of kinds. **Git is deliberately NOT on `CorpusFS`** — S3 must add a separate `CorpusGit` interface that operates *over* a `CorpusFS`, not methods on it (keeping the fake and non-git consumers from stubbing git they don't use).
- `paths.ts` — the only source of corpus paths (DD-009 folder layout). `workspaceSlug`/`safeSegment` are the single traversal choke point. **Do not hand-concatenate corpus paths elsewhere** — route every path through these builders so the sanitization can't be bypassed.
- `manifest.ts` — `workspace.json` schema + fail-loud codec. `parseManifest` throws a typed `CorpusError` on malformed/absent input; it never returns a default-empty manifest (that would masquerade as data loss).
- `opfsAdapter.ts` — `CorpusFS` over OPFS. SSR/unavailable → typed error; quota → `{kind:"quota-exceeded", substrate:"opfs"}` (not swallowed).
- `gitFs.ts` *(S3)* — `createGitFs(fs: CorpusFS, root)`: an iso-git fs-plugin shim OVER a `CorpusFS`. Translates `CorpusFS` (5 bytes+paths methods) into iso-git's node-`fs`-like promise surface — ENOENT-coded throws on missing (iso-git branches on `err.code`), synthesized dir-stat (a path with children = a directory; the repo root is always a dir), `mkdir` no-op (CorpusFS dirs are implicit), idempotent `unlink`/`rmdir`. **Two non-obvious iso-git@1.38.3 requirements (spike-found):** `bindFs` `.bind()`s ALL 10 fs commands incl. the "optional" `readlink`/`symlink` (they MUST exist or `git.init` throws `undefined.bind`); and `statusMatrix` lstats the working-tree root `.` (must stat as a directory).
- `gitCore.ts` *(S3)* — `createGitCore({fs,http,dir,onAuth,...})`: the plain, testable git logic over REAL `isomorphic-git`, all deps injected (no global http import). `commit` force re-adds every file (the zero-mtime `CorpusFS` shim defeats `statusMatrix`'s stat-cache fast-path, so same-size content edits would otherwise produce duplicate shas). `log` is lazy + paginated (`{filepath,depth,cursor}` → `{entries,nextCursor}`; fetch depth+1, slice, oid cursor) — the 3000-commit-cliff mitigation. Error mapping: HTTP 401/403 + cancelled auth → `{kind:"remote-auth-expired"}`; `MergeConflictError` → `{kind:"git-conflict", path}`; else typed io. `mapGitErrorForTest` is a test seam.
- `gitProtocol.ts` *(S3)* — the typed worker request/response discriminated union + `handleGitRequest(core, req)`: a PLAIN dispatch (CI-tested without a Worker) that wraps the whole body so ANY throw — typed or not — is reified via `toWorkerError` into `{ok:false, error: CorpusWorkerError}`; success → `{ok:true, result}`. **Nothing untyped crosses postMessage** (DD-009 §Failure-driven).
- `gitWorkerClient.ts` *(S3)* — `createGitWorkerProxy(transport)`: the main-thread `CorpusGit` impl over an INJECTED transport (a real `Worker` via `workerTransport(worker)` in prod, a fake in tests). Reconstructs a typed `CorpusError` from `{ok:false}` responses and throws it (callers get the same typed error as the non-worker path); correlates concurrent requests by id. Never spawns a global `Worker` at import (arch-review F3).
- `gitWorker.ts` *(S3)* — the thin dedicated Web Worker entry: worker-scope `Buffer` polyfill (iso-git UMD gotcha, contained off the main bundle), builds `gitCore` over OPFS-backed `gitFs` + `isomorphic-git/http/web`, forwards messages to `handleGitRequest`. Named `gitWorker.ts` (NOT a reserved App Router filename). Not CI-imported.
- `flag.ts` — `isCorpusEnabled()`, default-off, dev-only.
- `storeAdapter.ts` — `resolveWorkspaceStorage()` chooses debounced-localStorage (default) or `createCorpusBackedStorage(fs)`. **The seam is typed as `CorpusFS`** so S3's worker-proxy is a drop-in here without touching the store. (S3 itself ships `CorpusGit` — a SIBLING of `CorpusFS`, not a `CorpusFS` swap — so it does not change this selection; commit-on-write wiring is S4's.)

## S3: the git pipeline (`CorpusGit`)

- **`CorpusGit` is SEPARATE from `CorpusFS`** (`types.ts`, arch-review F1/ISP): `{init, commit, log, status, push, pull}`. It operates *over* a `CorpusFS` (via the `gitFs` shim), it is not a kind of `CorpusFS`. The in-memory `CorpusFS` fake carries no git methods (a test asserts this). Do not merge them.
- **iso-git runs in a dedicated worker** (DD-009 §Decision): `gitWorker.ts` (CPU bursts off the main thread). The main thread holds `gitWorkerClient`'s proxy. The git LOGIC (`gitCore`) is a plain module the worker calls, so CI tests it WITHOUT a worker (real iso-git on Node, vitest).
- **Typed errors cross the boundary** via the EXISTING `toWorkerError`/`CorpusWorkerError`/`CorpusErrorKind` (no new kind added; `git-conflict` + `remote-auth-expired` already existed). `handleGitRequest` reifies every throw; the proxy reconstructs `new CorpusError(detail, message)`.
- **`log` MUST be paginated** (`{depth, cursor}`); never an eager unbounded log — the 3000-commit cliff (perf-characteristics.md).
- **iso-git is contained** to `gitCore.ts`/`gitWorker.ts` (worker-side), behind the flag — small rip-out blast radius (DD-009 §Revisit: CVE/abandonment). Deps added: `isomorphic-git@^1.38.3`, `buffer@^6.0.3`.
- **commit-on-write is deferred to S4** — S3 ships `CorpusGit.commit()`; S4 calls it on logical save boundaries. Enabling the flag today does not auto-commit.
- **NOT CI-tested**: the real `Worker`, real OPFS-backed git, real remote push/pull, and the Turbopack worker bundle (nothing imports `gitWorker.ts` yet, so the build doesn't bundle it) → `docs/spikes/corpus-git-smoke.md`.

## Load-bearing facts for S2–S4

- **S1 is blob-mode.** The store writes the whole Zustand persist blob to one OPFS file (`state/workspace-zustand-v1.json`) via `CorpusFS`. The files-per-artifact folder layout (`paths.ts`/`manifest.ts`) is built and unit-tested but **not yet used by the store** — S4 is where the store starts reading/writing per-artifact files and the page.tsx session bridge is replaced. Don't assume enabling the flag today populates the folder layout; it doesn't.
- **S1 does no migration.** Flag-ON starts from an empty corpus. S4 owns the localStorage→corpus one-shot migration (back up the five old keys before deleting).
- **The contract suite is shared.** `app/lib/corpus/__tests__/corpusFsContract.ts` (`defineCorpusFsContract`) is run against the in-memory fake in CI and is intended to be run against the real OPFS adapter via Playwright out-of-CI (see `docs/spikes/corpus-opfs-smoke.md`). New `CorpusFS` implementations (FSA in S2, worker-proxy in S3) should be held to the same suite.
- **The "saved" indicator is NOT S1's.** OPFS-write-ack ≠ "saved" (durability is on the browser's flush schedule). The truthful save state derives from the FSA-mirror ack (S2) and remote-push ack (S3); S1 ships no save UI.

## Gotchas discovered in S1

- **`layout.ts` is a RESERVED filename under `app/`.** Next.js App Router treats any `app/**/layout.{ts,tsx}` as a route layout and the build fails with "Property 'default' is missing in type ... LayoutConfig". That's why the path builders live in `paths.ts`, not `layout.ts`. Avoid `page`, `route`, `template`, `default`, `loading`, `error`, `not-found` as module names anywhere under `app/` too.
- **`Uint8Array<ArrayBufferLike>` vs `BufferSource`.** Recent TS makes `Uint8Array` generic; typing an OPFS `write(data: BufferSource)` fails to accept it (SharedArrayBuffer mismatch). The local OPFS handle typings narrow `write` to `Uint8Array`.
- **jsdom has no OPFS.** `navigator.storage.getDirectory` is absent under Vitest. The adapter's success path is unverifiable in CI — that's the whole reason for the in-memory fake + the out-of-CI Playwright smoke. Don't add a `.test.ts` that needs real OPFS; it will silently no-op or fail.
