# Security Review — feat/corpus-architecture (DD-009 S0+S1)

**Scope:** `git diff main...HEAD -- app/` (corpus FS abstraction + OPFS adapter behind a default-off dev flag). Docs excluded.
**Date:** 2026-06-01
**Based on:** Stage-1 code-fact-check (11 Verified, 1 Mostly Accurate, 0 Incorrect — error model, quota reification, and SSR guard all confirmed honored).
**Deployment context:** Client-side, self-hosted single-tenant (one trust boundary per deployment, per repo CLAUDE.md §Deployment). OPFS is per-origin sandboxed.

No escalation patterns matched. No HALT block.

---

## Trust Boundary Map

```
B1: [workspace title / source id / custom-type id]  → [paths.ts workspaceSlug / safeSegment allowlist] → [POSIX corpus path under workspaces/]
B2: [arbitrary path string]                          → [opfsAdapter splitPath + walkDir]                → [OPFS directory/file handles]
B3: [persist blob value from zustand]                → [storeAdapter enc.encode → CorpusFS.writeFile]  → [OPFS file state/<name>.json]
B4: [bytes read back from OPFS / localStorage]       → [parseManifest / zustand merge]                 → [in-memory workspace state]
B5: [flag inputs: env NEXT_PUBLIC_CORPUS_FS, localStorage corpus-fs-enabled] → [isCorpusEnabled()]     → [substrate selection]
```

B1 is the designed choke point: untrusted user-authored titles and ids are sanitized into single, separator-free path segments before they can become directory names. B2 is the *raw* path entry into OPFS — it performs no traversal validation of its own and trusts that its callers (today only B3, eventually B1's builders) hand it clean paths. B3 is the only live writer in S1 and uses a hardcoded constant path. B4 is the deserialization boundary (manifest parse is fail-loud; zustand merge is pre-existing). B5 selects which substrate is active and is where the "dev-only" claim is enforced — or, as it turns out, not enforced. The whole module is client-side and OPFS is origin-sandboxed, so the blast radius of any path issue is bounded to the user's own per-origin storage, not other users or the host filesystem.

---

## Findings

#### OPFS adapter performs no path-traversal validation of its own; safety depends entirely on callers using paths.ts
**Severity:** Low
**Location:** `app/lib/corpus/opfsAdapter.ts:57-77` (`splitPath`, `walkDir`)
**Boundary:** B2
**Move:** #2 (implicit sanitization assumption), #1 (trust boundaries)
**Confidence:** High
**Legibility-target:** PR author / S4 implementer

`splitPath` strips only leading/trailing slashes and empty segments; it does not reject `.` or `..` segments. A path like `workspaces/../../escape/x` survives `splitPath` as `dirs=["workspaces","..","..","escape"]`, and `walkDir` would call `getDirectoryHandle("..")`. The adapter's safety against directory escape rests *entirely* on the documented contract that "the only source of corpus paths is paths.ts" (paths.ts:17-19) — but the adapter does not enforce that contract itself. Today this is not exploitable: the single live caller (`storeAdapter.ts`, B3) passes the hardcoded constant `state/workspace-zustand-v1.json`, and paths.ts (B1) is not yet wired to any caller (confirmed: no callers of the builders or the adapter exist outside the corpus module and tests). The exposure is latent — in S4, when the folder-layout builders start feeding the adapter, or if any future caller hand-builds a path, the only defense is reviewer discipline. The practical ceiling is low even if bypassed: OPFS is origin-sandboxed, so `..` cannot escape the origin's private storage to the real filesystem; the worst case is reading/clobbering another file *within the same origin's corpus*.

**Recommendation:** Add a defense-in-depth guard in `splitPath` (and the `readdir` path-split at line 128) that throws `CorpusError({kind:"io"})` if any segment is `.` or `..` (or contains a backslash). This makes the adapter safe regardless of caller discipline and turns the paths.ts "single choke point" comment into an enforced invariant rather than an honor system. Cost is ~2 lines and cannot break any legitimate path, since paths.ts never emits dot-segments.

#### Flag is documented "DEV-ONLY" but has no NODE_ENV guard — it can activate in production
**Severity:** Low
**Location:** `app/lib/corpus/flag.ts:15-25`
**Boundary:** B5
**Move:** #5 (invert the access-control model), #3 (error path)
**Confidence:** High
**Legibility-target:** PR author / deployer

`isCorpusEnabled()` returns `true` whenever `NEXT_PUBLIC_CORPUS_FS === "1"` or `localStorage["corpus-fs-enabled"] === "1"`, in *any* environment. The docstring (flag.ts:4) and CLAUDE.md both state the flag is "DEFAULT OFF and DEV-ONLY" and "must not be turned on for end users until S4 ships migration," because enabling it starts from an empty corpus with no localStorage migration. The code does not enforce the "dev-only" half: a production build with the env var set, or an end user who runs `localStorage.setItem("corpus-fs-enabled","1")`, silently swaps the persistence substrate and presents an empty workspace — their existing localStorage work appears to vanish (it is not deleted, just no longer read). This is a data-availability / user-trust hazard, not a confidentiality breach. Default-off is correctly implemented; the gap is that "dev-only" is a comment, not a constraint.

**Recommendation:** Gate the env-var branch behind `process.env.NODE_ENV !== "production"`, or document explicitly that the env var is intentionally honored in prod for self-hosters and is their responsibility. Given the single-tenant self-host model, a `NODE_ENV` guard on the env branch plus keeping the localStorage runtime toggle dev-gated is the lowest-surprise option. At minimum, make the empty-corpus state visible (a "corpus mode active, N items not migrated" banner) so the substrate swap is not silent.

#### CorpusError messages embed the full corpus path; low-sensitivity here but worth noting before S4
**Severity:** Informational
**Location:** `app/lib/corpus/types.ts:80-87`, `app/lib/corpus/opfsAdapter.ts:82`, `app/lib/corpus/manifest.ts:66`
**Boundary:** B2, B4
**Move:** #3 (error path / message leakage)
**Confidence:** High
**Legibility-target:** S3/S4 implementer

Error messages interpolate the offending path (`corpus path not found: ${d.path}`, `corpus i/o error at ${d.path}`) and `manifest.ts` interpolates the raw JSON-parse exception message. In S1 the only paths are sandboxed, non-secret corpus-relative paths (`state/...`, `workspaces/<slug>/...`) and the substrate is the user's own origin-private storage, so this leaks nothing the user doesn't already own. Flagging for forward-awareness: once S4 puts user-authored titles into slugs and S3 surfaces these errors across a worker boundary / into logs, a workspace title could end up echoed in an error string.

**Recommendation:** No action required for S1. When S3/S4 land, confirm these messages are not forwarded to any shared sink (server logs, analytics) without review; consider keeping the human-readable path in `detail` (structured) and a generic string in `message`.

#### Manifest parse is fail-loud and type-checked, but does not validate id/ext content (forward note)
**Severity:** Informational
**Location:** `app/lib/corpus/manifest.ts:86-104`
**Boundary:** B4
**Move:** #7 (serialization boundary), #2 (validated for format, not content)
**Confidence:** Medium
**Legibility-target:** S4 implementer

`parseManifest` correctly fails loud on malformed input (no silent default-empty manifest — confirmed by fact-check) and type-checks every field. However, `source.id`, `source.ext`, `artifact.type`, and `customTypeIds` entries are accepted as any string without re-running them through `safeSegment`/`safeExt`. The manifest is consumed by the path builders later (S4): `sourcePath(slug, source.id, source.ext)`. Because those builders re-sanitize their inputs at use-time (B1), a malicious `id` in a hand-edited or corrupted `workspace.json` would be neutralized when the path is built — *provided* every consumer routes through paths.ts. This is the same honor-system dependency as finding #1. Today there is no live consumer, so this is purely a note for S4.

**Recommendation:** No action for S1. In S4, ensure every manifest-derived id/ext flows through `safeSegment`/`safeExt` before becoming a path (it already does in `sourcePath`/`customTypePath`), and add a test asserting a manifest with a traversal-laden source id cannot produce an escaping path.

---

## What Looks Good

- **Allowlist, not denylist, sanitization (B1).** `SAFE_SEGMENT = /[^a-zA-Z0-9_-]+/g` replaces everything outside a tiny allowlist with a hyphen. No `.`, `/`, or `\` can survive, so dot-segment and separator-injection attacks are structurally impossible — verified empirically: `../etc/passwd` → `etc-passwd`, `..` → throw, `%2e%2e/` → `2e-2e`. This is the correct shape for a traversal guard.
- **NFKD normalization before sanitizing (B1).** Unicode homoglyph/compatibility tricks are folded first: fullwidth `ＡＢ`→`ab`, ligature `ﬀ`→`ff`, compatibility dots (`U+2024`, `U+FF0E`) normalize to `.` and are then stripped. Ideographic period `U+3002` does not decompose but is non-allowlisted and stripped anyway. All-unsafe titles throw rather than collapsing to `""` (which would silently escape `workspaces/`) — with an explicit test for this.
- **Empty-after-sanitize throws (B1).** Both `workspaceSlug` and `safeSegment` reject an empty result, closing the "all-unsafe title becomes empty segment" hole.
- **Quota errors reified, not swallowed (B2).** `wrap()` maps `QuotaExceededError` to a typed `{kind:"quota-exceeded", substrate:"opfs"}` instead of the legacy `console.warn`-and-drop. Confirmed by fact-check and the G7 test.
- **SSR/unavailable guard rejects with a typed error before touching `navigator` (B2).** `getRoot()` checks `navigator.storage.getDirectory` and throws `{kind:"unavailable"}` rather than a raw `TypeError`. Covered for every method by the G8 test.
- **Default-off, single hardcoded live path (B3, B5).** The only path reaching OPFS in S1 is the constant `state/workspace-zustand-v1.json`; the OFF path is a verbatim move of the prior localStorage adapter (characterization test). Minimal new attack surface.
- **Writable lifecycle is correct (B2).** `writeFile` closes the writable in a `finally`, so a mid-write failure does not leak an open handle.
- **No dependency-manifest changes.** No `package.json`/lockfile churn in the diff — supply-chain move (#10) is not implicated.

---

## Summary Table

| # | Finding | Severity | Boundary | Location | Confidence |
|---|---------|----------|----------|----------|------------|
| 1 | OPFS adapter does no traversal validation; relies on callers using paths.ts | Low | B2 | `opfsAdapter.ts:57-77` | High |
| 2 | "DEV-ONLY" flag has no NODE_ENV guard; can activate in prod (silent substrate swap) | Low | B5 | `flag.ts:15-25` | High |
| 3 | Error messages embed corpus path (sandboxed now; note for S3/S4) | Informational | B2,B4 | `types.ts:80-87`, `opfsAdapter.ts:82` | High |
| 4 | Manifest parse doesn't re-sanitize id/ext content (note for S4) | Informational | B4 | `manifest.ts:86-104` | Medium |

---

## Overall Assessment

The security posture of this change is sound for what it ships. The path-traversal choke point (`paths.ts`) — the reviewer's top priority — is correctly built as an allowlist over an NFKD-normalized string, and I could not construct any input (separator, dot-segment, URL-encoded, unicode homoglyph, compatibility dot, or empty-after-sanitize) that escapes `workspaces/`. The error model, quota reification, and SSR guard are all implemented as documented and confirmed by fact-check. Because the whole module is client-side and OPFS is origin-sandboxed, the realistic blast radius of any defect is the user's own per-origin storage — no cross-tenant or host-filesystem exposure exists in this single-tenant deployment model. None of the findings rise above Low, and none are exploitable on the one live code path (the hardcoded `state/` blob via storeAdapter). The two Low findings are both *latent* — they bite in S4/S3 when more callers appear or the flag is mis-enabled. The single most important thing to address is **finding #1**: add a 2-line `.`/`..`/backslash reject inside `splitPath` so the OPFS adapter enforces the no-traversal invariant itself rather than trusting every present and future caller to route through paths.ts. That turns the load-bearing comment into a guarantee at near-zero cost and de-risks S4 before it is written.

---

## Goal-Alignment Note

The user's goal is a comprehensive security review of feat/corpus-architecture before opening a PR, with priority on (1) path-traversal safety in paths.ts, (2) opfsAdapter path handling, (3) the storeAdapter blob, and (4) error-message leakage. This review addresses all four: priority (1) is the largest "What Looks Good" entry plus the empirical traversal testing and is assessed as correctly implemented; priority (2) is finding #1 (the adapter's lack of self-enforcement); priority (3) is covered by confirming the live path is a hardcoded constant with no injection vector (B3); priority (4) is finding #3. The findings are calibrated to the stated client-side, single-tenant, origin-sandboxed context — no finding is inflated by assuming a multi-tenant or server-filesystem threat model the deployment does not have. Nothing in the diff blocks opening the PR; finding #1 is a recommended pre-merge hardening, not a blocker.
