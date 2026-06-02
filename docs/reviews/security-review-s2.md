# Security Review — DD-009 S2 (FSA folder mirror)

**Scope:** `git diff feat/corpus-architecture..feat/corpus-fsa-mirror -- app/` — limited to `app/lib/corpus/fsaAdapter.ts`, `fsaPicker.ts`, `mirrorFs.ts`, and the `storeAdapter.ts` selection change. Tests and docs were read for context but not reviewed as deliverables.
**Commit:** `8cdbd4e025daae596e8428413a5181f9dc1f41da`
**Date:** 2026-06-01
**User goal:** Open a PR for DD-009 sub-task S2; this is the security gate before opening it.

> ⚠️ **No code fact-check report provided.** Claims about security properties in comments and module docstrings (e.g. "NEVER swallowed", "paths.ts is the sanitizing choke point") were verified by reading the code directly for this review, but not by an independent `code-fact-check` pass.

## Threat-model calibration

This is a **client-side, single-tenant, origin-sandboxed** Next.js app. The "attacker" surface is narrow and specific:

- There is **no server-side multi-tenant boundary** here — no other user's data to leak to, no privilege escalation across accounts.
- The FSA folder is **user-picked via a trusted browser gesture** (`showDirectoryPicker`), and the browser enforces the picked folder as a hard sandbox: the FSA API itself rejects `.`/`..`/separators in `getFileHandle`/`getDirectoryHandle` names, so the OS-level filesystem boundary is not ours to defend alone.
- The realistic threat is therefore **attacker-influenced *content* flowing into path segments** — a workspace title, source id, or artifact type that a user pastes from a malicious source — causing a write to land at an unintended path *inside* the picked folder (clobbering a sibling file, escaping the `workspaces/` namespace into `settings.json`, etc.), plus **integrity/trust failures in the persistence and permission lifecycle** that could silently mislead the user about whether their data is safely on disk.

Findings are calibrated to that model. Nothing here is multi-tenant-inflated.

## Trust Boundary Map

```
B1 (new): [user-picked folder via showDirectoryPicker]  → [pickFolder / ensurePermission]      → [FSA CorpusFS root handle]
B2 (new): [attacker-influenceable name: workspace title, source id, artifact type] → [paths.ts sanitizers → splitPath guard] → [FSA getFileHandle/getDirectoryHandle on disk]
B3 (new): [persisted FileSystemDirectoryHandle in IndexedDB] → [loadHandle → ensurePermission] → [reused FSA root across reloads]
B4 (new): [mirror op outcome (success/failure on user's disk)] → [enqueueMirror status/ack + onMirror] → [S5 status UI / sync-ack the user trusts]
```

- **B1** is the entry of the folder grant: an OS folder crosses into the app's trust as a writable root. Trust assumption: the user knowingly picked it.
- **B2** is the highest-value boundary in this diff. Path segments derived from arbitrary user/source text become real on-disk file/dir names. `paths.ts` is the *intended* choke point; `splitPath` in `fsaAdapter.ts` is a defense-in-depth second line.
- **B3** is the persistence boundary: a structured-clone of a directory handle is stored in IndexedDB and re-loaded after reload. Trust assumption: a persisted handle without a live permission grant must NOT be usable until `ensurePermission` re-confirms.
- **B4** is the integrity boundary: the app must tell the user the truth about whether bytes reached the folder. DD-009 forbids silent fallback.

Every finding below references one of these labels.

## Findings

#### `readdir` bypasses the `.`/`..`/backslash path-segment guard

**Severity:** Low
**Location:** `app/lib/corpus/fsaAdapter.ts:147-156` (the `readdir` method; compare to `splitPath` at `:58-67`)
**Boundary:** B2
**Move:** #2 (implicit sanitization assumption), #1 (trust boundary)
**Confidence:** High (that the gap exists); Medium-Low (that it is exploitable)

`readFile`, `writeFile`, `rm`, and `stat` all route their path through `splitPath`, which rejects any segment equal to `.`, `..`, or containing `\`. `readdir` does **not** — it re-splits the path inline (`path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean)`) with no segment guard, then feeds each segment straight to `getDirectoryHandle`. This is a parity break within the same adapter and a defense-in-depth hole at B2: the explicit second line of defense the other four methods get is absent here. (Note: the S1 OPFS adapter has the identical gap, so this is inherited, not S2-introduced — but S2 is where the segments resolve to a *real user folder on disk*, raising the stakes.)

Exploitability is **bounded by the browser**: the FSA spec requires `getDirectoryHandle` to reject names containing path separators and the literal `.`/`..`, so a `..` segment would throw a `TypeMismatchError`/`TypeError` at the API rather than walk upward. So this is not a live traversal escape *today*. The risk is (a) defense-in-depth: if a future refactor swaps the leaf for one that doesn't get the browser's free guard (e.g. a Node/worker FS in S3), `readdir` silently loses the protection the other methods keep; (b) a `.`/`..` segment currently produces a raw `TypeError`-class throw that `wrap()` will relabel as a generic `io` error instead of the clear `unsafe path segment` `CorpusError` the other methods emit.

**Recommendation:** Have `readdir` reuse the same segment guard as `splitPath` (extract a shared `assertSafeSegments(parts)` helper and call it from both `splitPath` and `readdir`). Low effort, restores parity, and future-proofs B2 against a non-browser leaf. Fix the OPFS twin in the same pass for consistency.

#### Persisted handle is reusable read-side without a fresh permission check enforced at the seam

**Severity:** Low (Informational-leaning, given the single-tenant model)
**Location:** `app/lib/corpus/fsaPicker.ts:135-149` (`saveHandle`/`loadHandle`) vs. `ensurePermission` `:78-93`
**Boundary:** B3
**Move:** #4 (time-of-check/time-of-use), #5 (invert the access-control model)
**Confidence:** Medium

`loadHandle` returns the persisted `FileSystemDirectoryHandle` and the docstring *correctly* states the caller "MUST call `ensurePermission` before using it." But that obligation is **a comment, not an enforced invariant** — nothing in the picker or adapter binds `loadHandle` to `ensurePermission`. The composition root (storeAdapter / S5) is trusted to sequence them. If a future wiring path loads the handle and passes it straight into `createFsaCorpusFs` without `ensurePermission`, the browser will still *prompt or reject* on first I/O (so this is not a silent grant bypass), but the failure would surface as a mid-operation `fsa-permission-revoked` thrown from a write rather than a clean up-front re-grant prompt — degrading the "prompt a re-grant after restart" UX that B3 exists to provide. Inverting the access model: the safe-by-default posture would be "a loaded handle is unusable until permission is re-confirmed," but the current seam is "a loaded handle is usable and permission is checked lazily by the browser."

Note this is **not** a permission *bypass*: the FSA permission model is enforced by the browser per-handle, and a persisted handle does not carry a live grant across a browser restart — re-grant requires a user gesture. The structured-clone in IndexedDB stores an opaque handle, not a capability token an attacker could forge.

**Recommendation:** Either (a) wrap load+permission into one exported `loadConnectedFolder()` that returns a handle *only after* `ensurePermission` succeeds, so callers cannot get an unchecked handle; or (b) if the lazy-check sequencing is deliberately deferred to S5, add an explicit test asserting the storeAdapter wiring calls `ensurePermission` before first use, so the comment-only invariant gains a regression guard.

#### `ensurePermission` treats a handle lacking the permission API as "granted"

**Severity:** Informational
**Location:** `app/lib/corpus/fsaPicker.ts:84-92`
**Boundary:** B1, B3
**Move:** #5 (invert the access-control model), #3 (error/edge path)
**Confidence:** Medium

`ensurePermission` initializes `state = "granted"` and only downgrades it if `queryPermission` exists and returns non-granted. A handle whose `queryPermission`/`requestPermission` are absent is therefore assumed granted (the docstring says so: "Handles without the permission API ... are assumed granted — querying is best-effort"). In real browsers a genuine `FileSystemDirectoryHandle` always exposes these methods, so the optimistic default only triggers for fakes/older shapes. The residual risk: if a future code path could feed an object that *looks* like a handle but lacks the permission methods (e.g. a partially-deserialized IndexedDB value, or a test fake leaking into prod), `ensurePermission` returns `true` without ever confirming a grant — the access-control check that *can't fail* is the textbook security-theater inverse, but here it errs toward allow. Single-tenant and browser-enforced-at-I/O, so impact is low; flagging for the principle.

**Recommendation:** Consider failing closed when the permission API is entirely absent on a handle that is supposed to be a live FSA handle (throw `unavailable` rather than assume `granted`), or at minimum narrow the optimistic branch to the test path only. Defense-in-depth, not urgent.

## What Looks Good

- **B4 failure surfacing is correct and matches the DD-009 mandate.** `enqueueMirror` (`mirrorFs.ts:96-128`) exhausts bounded backoff and, on terminal failure, sets `status.state = "failed"` with the typed `lastError` and emits — it never swallows. The write path (`writeFile`/`rm`) resolves on primary success but tracks the mirror via `void enqueueMirror(...)`, so the sync-ack reflects the *mirror* outcome, not the OPFS write-ack. This is exactly the "surface, don't swallow" contract, and the module docstring's claim about it checks out against the code.
- **B2 sanitization is layered correctly.** `paths.ts` is a genuine single choke point — every builder routes segments through `workspaceSlug`/`safeSegment`, whose `[^a-zA-Z0-9_-]+` allowlist (with NFKD normalization first, so unicode homoglyphs/composed dots can't survive) makes `/`, `\`, `.`, and control chars structurally impossible in a segment, and throws rather than silently producing `""`. `splitPath` in the adapter is a correct defense-in-depth second line for the four methods that use it.
- **B1 error taxonomy is precise.** `pickFolder` correctly distinguishes user-cancel (`AbortError` → `null`, a benign no-op) from API-unavailable (typed `unavailable`) from permission-class `DOMException`s (`NotAllowedError`/`SecurityError` → `fsa-permission-revoked`). The adapter's `wrap()` and `isPermissionLost()` map the same permission-class exceptions to `fsa-permission-revoked` consistently, so a revoked grant is surfaced as a re-grantable typed error and never silently treated as success — directly addressing scope priority (2).
- **`writeFile` resource cleanup is correct.** The writable is closed in a `finally` (`fsaAdapter.ts:131-135`), so a write error doesn't leak an open writable handle.
- **The production guard is robust** (`flag.ts`): the hard `NODE_ENV === "production"` short-circuit means none of this FSA/IndexedDB code path is reachable in a production build, which materially shrinks the real-world blast radius of every finding above.
- **No secrets, no crypto, no network, no serialization-of-untrusted-data in this diff.** The IndexedDB value is an opaque browser-minted handle, not attacker-craftable data deserialized into executable shape — move #6, #7, #9 surface nothing.

## Summary Table

| # | Finding | Severity | Boundary | Location | Confidence |
|---|---------|----------|----------|----------|------------|
| 1 | `readdir` bypasses the `.`/`..`/`\` segment guard | Low | B2 | `fsaAdapter.ts:147-156` | High / Med-Low (exploit) |
| 2 | Persisted handle reusable without enforced re-permission at the seam | Low | B3 | `fsaPicker.ts:135-149` | Medium |
| 3 | `ensurePermission` defaults absent-permission-API handle to "granted" | Informational | B1,B3 | `fsaPicker.ts:84-92` | Medium |

No Critical or High findings. No escalation block warranted — no near-certain-exploitable high-blast-radius pattern is present.

## Overall Assessment

For a client-side, single-tenant, origin-sandboxed feature gated behind a production-disabled dev flag, the security posture of S2 is **solid and ship-ready**. The four scope priorities all check out: (1) the IndexedDB-persisted handle is an opaque browser capability with no forgeable token and no grant that survives a restart unchecked; (2) the permission lifecycle correctly surfaces a revoked grant as the typed `fsa-permission-revoked` rather than swallowing it as success, on both the picker and adapter paths; (3) path traversal is defended in depth — `paths.ts` is a real choke point and the browser's own FSA name validation backstops the adapter — though `readdir` is the one method missing the explicit second-line guard its four siblings have; (4) mirror failures are genuinely surfaced via status/ack/typed error and never silently dropped, satisfying DD-009's no-silent-fallback rule. The only findings are defense-in-depth / future-proofing items, all fixable in place with small local edits and none blocking. **The single most worthwhile fix is #1** — extract one shared `assertSafeSegments` helper so `readdir` regains parity with the other methods and B2's second line of defense survives the S3 worker-FS swap.

## Goal-Alignment Note

This review was produced to clear the security gate before opening the S2 PR (DD-009 sub-task S2). It is scoped strictly to the S2 diff against `feat/corpus-architecture`, calibrated to the client-side single-tenant origin-sandboxed threat model the goal specifies, and does not inflate findings to a multi-tenant server posture the feature does not have. Conclusion: **no security blocker to opening the PR.** The three Low/Informational findings can be addressed in this PR or tracked as follow-ups at the author's discretion; recommend at least fixing #1 (the `readdir` guard parity) before merge since it is a one-line-helper change that closes a real defense-in-depth gap at the highest-value boundary (B2).
