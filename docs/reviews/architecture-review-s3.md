# Architecture Review: corpus S3 — isomorphic-git pipeline in a worker

**User goal:** Implement DD-009 sub-task S3 — the iso-git commit/push/pull pipeline behind the corpus flag, in a worker, with typed errors across the boundary.
**Scope:** the planned S3 modules under `app/lib/corpus/` (`gitFs.ts`, `gitCore.ts`, `gitProtocol.ts`, `gitWorkerClient.ts`, `gitWorker.ts`, the `CorpusGit` interface) + the `isomorphic-git` dependency add.
**Date:** 2026-06-01

Self-applied to the plan (not yet to code) because the change hits three of the four trigger categories: (1) module structure — 5+ new modules; (2) public APIs — a new `CorpusGit` interface + worker protocol types; (4) cross-cutting concerns — a worker-boundary error-handling pipeline and a new dependency. Findings are folded into the plan steps.

## Dependency Map

```
gitWorker.ts (worker entry)  ──calls──>  gitCore.ts ──uses──>  gitFs.ts ──over──>  CorpusFS (S1)
       │ (dispatch)                          │                                         │
       └── gitProtocol.ts (typed req/resp + toWorkerError) <── types.ts (CorpusErrorKind, single source)
gitWorkerClient.ts (main thread) ──postMessage──> gitWorker ; reconstructs CorpusError from CorpusWorkerError
CorpusGit (interface)  <── gitWorkerClient implements it ; SEPARATE from CorpusFS
isomorphic-git (new dep) ── imported ONLY by gitCore/gitWorker (worker scope) — never the main bundle
```

Dependency direction is inward toward the stable S1 core (`types.ts`, `CorpusFS`). iso-git is a leaf dependency confined to the worker-side modules. No cycle. No upward dependency (nothing in S1 imports S3).

## Findings

### F1 — ISP: `CorpusGit` MUST be a separate interface from `CorpusFS` (Structural, must-hold)
The single most load-bearing constraint (S1 arch-review finding 2, restated in types.ts:18-22 and the seam doc). Adding `commit`/`log`/`push`/`pull` to `CorpusFS` would force the in-memory fake and every non-git consumer (the store's storage seam) to stub git they never call. **Resolution:** `CorpusGit` is a distinct interface (`{ commit, log, push, pull, status }`); the worker proxy implements `CorpusGit`, not `CorpusFS`. The git pipeline operates *over* a `CorpusFS` (via the `gitFs` shim), it is not a `CorpusFS`. Verified by a test asserting the in-memory `CorpusFS` fake has no `commit` method (test G20). → plan steps 1, 9.

### F2 — SRP / thin transport: keep the worker dumb, the logic plain (Structural)
iso-git's CPU bursts must run off the main thread (DD-009), but a worker is untestable in jsdom. **Resolution:** split transport from logic. `gitCore.ts` is a plain module (real iso-git over an injected fs+http) that CI tests directly against a Node tmpdir. `gitWorker.ts` is a thin shell: receive message → dispatch to a plain handler (`gitProtocol.handleRequest(gitCore, msg)`) → `postMessage` the typed result. The handler is a plain exported function so CI tests it without a `Worker`. This mirrors S2's mirror (transport) vs leaf-adapter (logic) split. → plan steps 2, 4, 5.

### F3 — DI at the composition root, no global singletons (Coupling)
S2's discipline (arch-review F3): the connected handle is injected into `resolveCorpusFs`, not reached out of a picker global. **Resolution for S3:** `gitCore` takes its `fs`, `http`, `dir`, and `onAuth` as parameters (no module-level `import http from "isomorphic-git/http/web"` hard-wire — inject so CI passes `http/node` or a fake). `gitWorkerClient(transport)` takes the transport (a `Worker` in prod, a fake in tests), never spawns a global `Worker` at import. The composition root that wires a real `Worker` + OPFS-backed `gitFs` is a single factory called from a client effect, never at module load. → plan steps 2, 5.

### F4 — Error-kind single source preserved (Structural)
The new failure paths (conflict, remote-auth) reuse the EXISTING `git-conflict` and `remote-auth-expired` kinds in `types.ts` (already present). **Resolution:** S3 adds NO new `CorpusErrorKind`. If a genuinely new kind were needed it would go only in `types.ts` and `assertNever` would force every switch to handle it — but the audit found the two needed kinds already exist. `toWorkerError`/`isCorpusWorkerError` are reused verbatim. → plan steps 1, 3.

### F5 — Boundary contract: nothing untyped crosses postMessage (Cross-cutting, must-hold)
DD-009 §Failure-driven forbids silent fallback. **Resolution:** the worker dispatch wraps the WHOLE handler body in a try/catch that funnels any throw (typed or not) through `toWorkerError` (untyped → `{kind:"io"}`), so the response is ALWAYS `{ok:true,result} | {ok:false,error:CorpusWorkerError}` — never an unhandled rejection or a raw Error reaching the main thread. The proxy reconstructs `new CorpusError(error.detail, error.message)` and throws it, so callers get a typed `CorpusError` identical to the non-worker path. → plan steps 3, 4, 5; tests G16–G19.

### F6 — Dependency containment (Coupling, dependency add)
`isomorphic-git` is the initiative's first runtime dependency. **Resolution:** it is imported ONLY by `gitCore.ts`/`gitWorker.ts` (worker-side). The main thread depends on `CorpusGit` + `gitWorkerClient`, which know nothing of iso-git. If iso-git is ever ripped out (DD-009 §Revisit: CVE/abandonment), the blast radius is two files behind a flag — the `CorpusGit` interface and its consumers are insulated. The Buffer polyfill lives in worker scope, not the main bundle. → plan Risks (supply-chain), step 2.

### F7 — `gitFs` is a faithful adapter, not a leaky one (Coupling)
The shim translates `CorpusFS` (5 methods) → iso-git's node-fs surface. Risk: leaking `CorpusFS`'s "null on missing" semantics where iso-git expects an ENOENT throw. **Resolution:** the shim is a real adapter — it converts `null`→`ENOENT`-coded throws and synthesizes dir-stat from `readdir`, presenting iso-git EXACTLY the contract it branches on (`err.code`, `isDirectory()`). It does not let `CorpusFS` semantics leak through. Verified by running real iso-git over the shim (test G7–G13 substrate-parity run). → plan steps 1, 7.

## Summary
The design is structurally sound: dependency direction flows inward to the stable S1 core, iso-git is contained to two worker-side files behind a flag, and the transport/logic split keeps the CPU-heavy, jsdom-untestable worker thin while the git logic stays CI-testable. The two must-hold constraints (F1 ISP separation of `CorpusGit` from `CorpusFS`; F5 typed-error boundary) are exactly the S1 invariants S3 was warned to honor, and both are addressed by concrete plan steps + tests. No structural finding blocks implementation; the residual architectural risk is F7 (the shim's fidelity to iso-git's fs contract), de-risked by running real iso-git over the shim in CI.
