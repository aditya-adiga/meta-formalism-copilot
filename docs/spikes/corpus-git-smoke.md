# Corpus git worker smoke (DD-009 S3) — out-of-CI, pre-merge / pre-launch gate

Date: 2026-06-01
Relevant paths: app/lib/corpus/gitWorker.ts, app/lib/corpus/gitWorkerClient.ts, app/lib/corpus/gitCore.ts, app/lib/corpus/gitFs.ts

jsdom has no `Worker`, no OPFS, and no network, so three S3 surfaces cannot run
in the Vitest suite. CI covers the git LOGIC (real `isomorphic-git` over the
`gitFs` shim + an in-memory `CorpusFS`, on Node — see `gitCore.test.ts`,
`gitCore-errors.test.ts`) and the typed-error boundary (`gitProtocol.test.ts`,
`gitWorkerClient.test.ts` over a fake transport). This smoke covers the
remainder, in a real browser, and is **NOT claimed as CI-tested**:

1. The real **Web Worker** transport (`new Worker(new URL("./gitWorker.ts", import.meta.url))`).
2. iso-git over **real OPFS** (the `gitFs` shim's dir-stat synthesis against a real
   OPFS adapter — the one place the shim heuristic could diverge from the fake).
3. A real **remote push/pull** round-trip (HTTP transport, auth, conflict).
4. The **Turbopack worker bundle** + the worker-scope `Buffer` polyfill actually
   loading (today nothing imports `gitWorker.ts`, so the build does not yet bundle
   it; the first real `new Worker(new URL(...))` reference is what exercises this —
   verify the bundle resolves `buffer` and `isomorphic-git/http/web`, adding a
   `turbopack.resolveAlias` for `buffer` only if the bundle errors).

**Status:** manual, pre-merge before the corpus flag is ever defaulted on, and a
hard pre-launch gate for the remote axis. Not wired into CI (needs a Playwright
browser env, a bundling step, and a throwaway remote). Safari/WebKit remains a
pre-launch item (Playwright WebKit doesn't run on WSL2 — see
docs/spikes/iso-git-browser-smoke.md).

## What to verify

Spawn the worker from a real page and drive the `CorpusGit` proxy:

1. **Worker round-trip**: `proxy.init()` then `proxy.commit("smoke")` resolves with
   a 40-char `oid` and `noChange:false`; a second `commit` with no change resolves
   `noChange:true`. (Proves the worker transport + reification end-to-end.)
2. **OPFS-backed `gitFs`**: after the commits, the corpus OPFS root contains a
   `.git/` directory (inspect via `navigator.storage.getDirectory()`); `proxy.log()`
   returns the commits newest-first; `proxy.log({depth:1})` returns exactly one
   entry + a non-null `nextCursor`, and paging with that cursor never repeats.
   (Proves the shim's dir-stat synthesis works against REAL OPFS, not the fake.)
3. **`log({filepath})`** over a file with several versions returns only its commits
   (F6 provenance) and stays interactive at 100+ commits (cliff guard).
4. **Remote push/pull**: configure a throwaway remote (a private GitHub/GitLab repo
   or a local `git http-backend`); `proxy.push()` succeeds with valid auth; with a
   bad/expired token it rejects a `CorpusError {kind:"remote-auth-expired"}`
   (NOT a generic io error). Make a divergent commit on the remote, then `proxy.pull()`
   on a both-sides edit rejects `{kind:"git-conflict", path}`.
5. **Buffer/Turbopack**: confirm the worker bundle loads without a
   `Buffer is not defined` error in the browser console (the worker-scope shim).

## How to run (sketch — mirrors the iso-git browser spike harness)

```bash
# from a throwaway dir; bundle the worker + a driver page, drive with Playwright.
# Wire `new Worker(new URL("../app/lib/corpus/gitWorker.ts", import.meta.url))`
# in a tiny client page, expose createGitWorkerProxy(workerTransport(worker)) on
# window, then page.evaluate() the 5 checks above against a throwaway remote.
npx playwright install chromium firefox
node /tmp/corpus-git-smoke/runner.mjs   # asserts the 5 behaviors, prints per-op result
```

Gate criteria:
- Behaviors 1–3 pass on Chromium and Firefox (the worker + OPFS path).
- Behavior 4 (auth-expired + git-conflict typed errors) passes against a real remote.
- Behavior 5: no `Buffer is not defined`; if the Turbopack bundle errors on `buffer`,
  add `turbopack.resolveAlias: { buffer: "buffer" }` in `next.config.ts` and re-run.

If any fails, fix before the flag is enabled for anything beyond local dev, and
before the remote axis is exposed to end users.

## Results

_(not yet run — fill in when executed before enabling the flag in a shared
environment / before exposing the git-remote axis.)_
