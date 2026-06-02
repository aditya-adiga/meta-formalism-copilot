# Corpus FSA browser smoke (DD-009 S2) — out-of-CI, pre-merge gate

Date: 2026-06-01
Relevant paths: app/lib/corpus/fsaAdapter.ts, app/lib/corpus/mirrorFs.ts, app/lib/corpus/fsaPicker.ts, app/lib/corpus/__tests__/corpusFsContract.ts

jsdom has neither the File System Access API (`showDirectoryPicker`,
`FileSystemDirectoryHandle`) nor a way to persist a handle in IndexedDB, so the FSA
adapter's *success* path, the real folder picker, the permission lifecycle, and
handle persistence across reload **cannot run in the Vitest suite**. CI exercises
only: the FSA adapter over a fake handle (held to the shared contract), the mirror
over two in-memory fakes, and the picker with a stubbed `showDirectoryPicker` +
in-memory handle store. This smoke runs the real thing in a real browser. It is the
FSA analog of `docs/spikes/corpus-opfs-smoke.md`.

**Status:** manual, pre-merge before the corpus flag is ever defaulted on (or
enabled in any shared environment). Not wired into CI (needs a Playwright browser
env, a bundling step, and a real folder grant the headless unit suite can't give).
Firefox and Safari do **not** implement `showDirectoryPicker` — on those browsers
`pickFolder()` rejects `{kind:"unavailable"}` and the app stays OPFS-only (DD-009
degraded mode); this smoke targets **Chromium/Edge only**, which is consistent with
DD-009's #4'-over-#4 rationale (FSA is opt-in browser-breadth-permitting).

## What to verify

1. **Picker happy path** — call `pickFolder()` from a button click, choose an empty
   folder. Resolves to a `FileSystemDirectoryHandle`. `ensurePermission(handle)`
   returns true (the picker grants readwrite).
2. **Picker cancel** — call `pickFolder()`, dismiss the dialog (Esc). Resolves to
   `null` (no thrown error, folder stays disconnected).
3. **FSA adapter contract behaviors** — over `createFsaCorpusFs(realHandle)`, run
   the shared `CorpusFS` contract behaviors:
   - `readFile`/`stat` of a missing path → `null`; `readdir` of a missing dir → `[]`.
   - Byte round-trip of all 256 byte values (no UTF-8 mangling).
   - Nested-path create + `readdir` at each level — and confirm the files/folders
     actually appear in Finder/Explorer (the whole point of the user-visible folder).
   - 30 small `v####.md` files under one dir, `readdir` → 30, read each back.
   - `rm` removes a file (gone from disk) and is idempotent on a missing path.
4. **Mirror end-to-end** — build `createMirrorCorpusFs({ primary: createOpfsCorpusFs(),
   mirror: createFsaCorpusFs(realHandle) })`. `writeFile` then:
   - the bytes appear in OPFS immediately and in the picked folder on disk shortly
     after; `getMirrorStatus()` transitions pending → ok.
   - `onMirror` fires with the ok status (the truthful sync-ack).
5. **Read fallthrough recovery** — write via the mirror, then clear OPFS only
   (`await (await navigator.storage.getDirectory()).removeEntry('state',{recursive:true})`),
   then `readFile` the same path → returns the bytes from the FSA folder (the
   browser-storage-clear recovery DD-009 promises).
6. **Permission revoked across reload** — `saveHandle(handle)`, reload the page,
   `loadHandle()` returns the handle, `ensurePermission(handle)` shows `"prompt"`
   and (after the user clicks allow) returns true; if the user denies, it rejects
   `{kind:"fsa-permission-revoked"}`. Confirm a mirror write while revoked sets
   `getMirrorStatus()` → `failed` with `lastError.detail.kind === "fsa-permission-revoked"`
   (the iso-git pre-mortem narrative #4 mitigation — the ack must NOT lie).
7. **Quota** (optional, slow) — fill the FSA folder until a write rejects
   `{kind:"quota-exceeded", substrate:"fsa"}`.

## How to run (sketch — mirrors the OPFS smoke harness)

```bash
# from a throwaway dir; bundle the adapters for the browser, then drive with Playwright.
npx esbuild app/lib/corpus/fsaAdapter.ts app/lib/corpus/mirrorFs.ts \
  app/lib/corpus/fsaPicker.ts app/lib/corpus/opfsAdapter.ts app/lib/corpus/types.ts \
  --bundle --format=esm --outfile=/tmp/corpus-fsa-smoke/bundle.js
# serve a tiny page with a "Pick folder" button that exposes the factories on window;
# Playwright cannot auto-grant the native folder picker, so checks 1/2/6 are MANUAL
# (a human clicks the dialog); checks 3/4/5/7 run via page.evaluate after the grant.
npx playwright install chromium
node /tmp/corpus-fsa-smoke/runner.mjs   # asserts checks 3-5,7; prints per-op result
```

Gate criterion: checks 1–6 pass on Chromium/Edge (check 7 optional). If any fails,
fix before the flag is enabled for anything beyond local dev. Note Playwright cannot
script the native directory-picker grant, so the picker/permission checks (1, 2, 6)
are inherently human-in-the-loop, exactly like the OPFS quota check.

## Results

_(not yet run — fill in when executed before enabling the flag in a shared environment)_
