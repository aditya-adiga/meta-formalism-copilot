# The corpus FS seam (DD-009 S1) — notes for S2–S4

Last verified: 2026-06-01
Relevant paths: app/lib/corpus/, app/lib/stores/storeAdapter (corpus/storeAdapter.ts), docs/decisions/009-artifact-corpus-architecture.md, docs/working/decomposition-corpus-architecture.md

What S1 built and the contracts later sub-tasks must hold to.

## The module (`app/lib/corpus/`)

- `types.ts` — `CorpusFS` (async, bytes+paths) + the single `CorpusErrorKind` source of truth feeding `CorpusError` (thrown) and `CorpusWorkerError` (postMessage-serializable). `assertNever` enforces exhaustive handling of kinds. **Git is deliberately NOT on `CorpusFS`** — S3 must add a separate `CorpusGit` interface that operates *over* a `CorpusFS`, not methods on it (keeping the fake and non-git consumers from stubbing git they don't use).
- `paths.ts` — the only source of corpus paths (DD-009 folder layout). `workspaceSlug`/`safeSegment` are the single traversal choke point. **Do not hand-concatenate corpus paths elsewhere** — route every path through these builders so the sanitization can't be bypassed.
- `manifest.ts` — `workspace.json` schema + fail-loud codec. `parseManifest` throws a typed `CorpusError` on malformed/absent input; it never returns a default-empty manifest (that would masquerade as data loss).
- `opfsAdapter.ts` — `CorpusFS` over OPFS. SSR/unavailable → typed error; quota → `{kind:"quota-exceeded", substrate:"opfs"}` (not swallowed).
- `flag.ts` — `isCorpusEnabled()`, default-off, dev-only.
- `storeAdapter.ts` — `resolveWorkspaceStorage()` chooses debounced-localStorage (default) or `createCorpusBackedStorage(fs)`. **The seam is typed as `CorpusFS`** so S3's worker-proxy is a drop-in here without touching the store.

## Load-bearing facts for S2–S4

- **S1 is blob-mode.** The store writes the whole Zustand persist blob to one OPFS file (`state/workspace-zustand-v1.json`) via `CorpusFS`. The files-per-artifact folder layout (`paths.ts`/`manifest.ts`) is built and unit-tested but **not yet used by the store** — S4 is where the store starts reading/writing per-artifact files and the page.tsx session bridge is replaced. Don't assume enabling the flag today populates the folder layout; it doesn't.
- **S1 does no migration.** Flag-ON starts from an empty corpus. S4 owns the localStorage→corpus one-shot migration (back up the five old keys before deleting).
- **The contract suite is shared.** `app/lib/corpus/__tests__/corpusFsContract.ts` (`defineCorpusFsContract`) is run against the in-memory fake in CI and is intended to be run against the real OPFS adapter via Playwright out-of-CI (see `docs/spikes/corpus-opfs-smoke.md`). New `CorpusFS` implementations (FSA in S2, worker-proxy in S3) should be held to the same suite.
- **The "saved" indicator is NOT S1's.** OPFS-write-ack ≠ "saved" (durability is on the browser's flush schedule). The truthful save state derives from the FSA-mirror ack (S2) and remote-push ack (S3); S1 ships no save UI.

## Gotchas discovered in S1

- **`layout.ts` is a RESERVED filename under `app/`.** Next.js App Router treats any `app/**/layout.{ts,tsx}` as a route layout and the build fails with "Property 'default' is missing in type ... LayoutConfig". That's why the path builders live in `paths.ts`, not `layout.ts`. Avoid `page`, `route`, `template`, `default`, `loading`, `error`, `not-found` as module names anywhere under `app/` too.
- **`Uint8Array<ArrayBufferLike>` vs `BufferSource`.** Recent TS makes `Uint8Array` generic; typing an OPFS `write(data: BufferSource)` fails to accept it (SharedArrayBuffer mismatch). The local OPFS handle typings narrow `write` to `Uint8Array`.
- **jsdom has no OPFS.** `navigator.storage.getDirectory` is absent under Vitest. The adapter's success path is unverifiable in CI — that's the whole reason for the in-memory fake + the out-of-CI Playwright smoke. Don't add a `.test.ts` that needs real OPFS; it will silently no-op or fail.
