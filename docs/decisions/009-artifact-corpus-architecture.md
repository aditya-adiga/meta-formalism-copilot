# 009: Artifact corpus architecture — OPFS-cached, FSA-folder-and-git-remote source of truth

**Goal**: Decide how the user's body of generated work (every artifact, every version, every custom artifact type definition) is persisted and synchronized, replacing the current localStorage-only model in which session switching silently erases custom artifact type references and flattens per-panel version histories.

**Project state**: Standalone decision record · sequencing: blocks implementation in a future RPI loop · not blocked.

**Task status**: complete (decision selected via Diamond 2 step 4 with user confirmation; implementation deferred to a separate RPI loop).

## Context

The trigger was an observed bug: switching workspace sessions silently erases references to custom artifact types. Investigation of `app/page.tsx:135-184` confirmed two distinct failures of the current persistence model:

1. `getWorkspaceSnapshot` and `resetWorkspaceToSnapshot` both omit `customArtifactTypes` and `customArtifactData` from the session-snapshot bridge. Custom type *definitions* leak across sessions (Zustand partial-`setState` leaves untouched keys alone), while custom type *generated content* is dropped on session switch.
2. `getWorkspaceSnapshot` calls `s.getArtifactContent(key)` per panel, returning only the current version's content. `ArtifactRecord.versions[]` (full history) lives in the Zustand store but is flattened away by every session save/restore.

The deeper architectural question — reframed by the project owner — is that the persistence model treats artifacts as in-memory state that gets serialized incidentally, not as first-class durable objects. Three fragmented stores (Zustand `workspace-zustand-v1`, session-index `workspace-sessions`, frozen per-session workspace blobs) make it structurally easy for categories of data to drift apart, as the custom-type bug demonstrates.

Diamond 1 of this DD selected the chosen framing **F10 + F4 + F6** (recorded above this section in the workflow log; reproduced here):

> The product treats the user's body of generated work — every artifact, every version, every custom artifact type definition — as a first-class **corpus** that exists outside this tool's data model: portable across devices the same user owns (F4) and preserving every version with attribution (F6), so the LLM tool becomes one of many that read from and write to that corpus, swappable without losing work. We selected this over F1 (sovereignty) and F3 (interop) because F10 subsumes their motivational content (both are *reasons* the corpus should be outside the tool) without pre-committing to a single storage mechanism, while F1 alone leaves cross-device unsolved and F3 alone exposes the broadest security surface. Diamond 2 generated solutions evaluated against F10+F4+F6 jointly; approaches that solve only F7 (internal cleanup) or F9 (snapshot-bridge patch) are out-of-scope, not alternatives.

## Options considered

Diamond 2 generated 13 candidates spanning storage substrates (OPFS / FSA / cloud DB / git / CRDT), sync mechanisms (manual zip / git push / WebDAV / CRDT relay / custom HTTP), and trust models. Five survived step-3 pruning for hard-constraint coverage: **#4** FSA + isomorphic-git, **#5** OPFS + git push to remote, **#6** direct-git-push (no local cache), **#9** FSA + per-version sidecar files (no git), **#12** hybrid with three pickable sync targets. Step-4 stress-test eliminated #6 (invert-the-thesis surfaced offline-broken + auth-expiry costs), downgraded #12 (organizational-survival flagged single-maintainer cost of three sync paths), and brought #4 and #5 within tie-distance on the axis "user-visibility of local copy vs cross-browser breadth." The tie was resolved by introducing a hybrid refinement, **#4'**.

See alternatives considered →

## Decision and rationale

**Chosen approach: #4' — OPFS as the transparent local cache; user-picked FSA folder + user-configured git remote as the corpus (source of truth).**

Architecture:

- **OPFS (Origin Private File System)** is the always-on local working copy. Browser-sandboxed, available in every modern browser, no permission prompt, predictable per-origin quota.
- **User-picked FSA folder** is the user-visible source of truth on disk. On first run (or workspace create), the app prompts for a folder; the folder *is* the corpus.
- **User-configured git remote** is the cross-device sync surface. Push/pull on commit; offline-capable through the OPFS cache and the local git working tree inside the folder.
- **Read path**: OPFS first (fast); fall through to FSA folder if OPFS is empty (recovery after browser-storage clear).
- **Write path**: writes commit to OPFS synchronously (no UI wait); async mirror to FSA folder (with retry); async push to remote (with backoff).
- **Degraded modes**: no FSA permission → OPFS-only (full read/write; user can connect a folder later and trigger one-time mirror). No git remote → local-only (folder works, manual cross-device via user's existing filesystem cloud-sync if they want it).

Folder layout (concrete proposal — to be refined in the implementation plan):

```
<corpus-root>/
├── workspaces/
│   └── <workspace-slug>/
│       ├── workspace.json               # manifest: sources, panels, current versions
│       ├── sources/
│       │   └── <source-id>.{txt,pdf,...}
│       ├── artifacts/
│       │   ├── semiformal/
│       │   │   ├── v0001.md
│       │   │   ├── v0002.md             # full history; `git diff` / `git blame` work
│       │   │   └── meta.json            # provenance per version
│       │   ├── causal-graph/...
│       │   └── custom/
│       │       └── <custom-type-id>/...
│       ├── custom-types/
│       │   └── <custom-type-id>.json    # the DEFINITION (also versioned via git)
│       └── decomposition/
│           ├── nodes/
│           │   └── <node-id>/artifacts/...
│           └── graph-layout.json
└── settings.json                        # workspace-list metadata
```

**Falsifiable hypothesis** (window: 6 weeks post-deploy of v1):
*A researcher who has used the app on device A picks up the workspace on device B by cloning their remote and opening the app in <5 minutes, with no version-history loss and all custom type definitions intact. Counter-evidence would be (a) session-switch tests still drop any artifact version, (b) cross-device cold-start exceeds 10 minutes, or (c) >20% of users in the first month report inability to complete FSA + git remote setup without out-of-band help.*

**Rationale for choosing #4' over its closest rivals:**

- **vs #4** (FSA + isomorphic-git, no OPFS cache): identical corpus property, but #4 leaves Firefox/Safari users with no working mode (FSA gaps). #4' degrades gracefully to OPFS-only there, preserving F10 partially (corpus exists, just not yet user-visible until the user switches browsers or downloads an export).
- **vs #5** (OPFS + git push only): identical browser breadth, but #5 leaves the user-visible folder optional/absent. #4''s opt-in FSA mirror gives F10 its strongest reading (corpus literally visible in Finder/Explorer) without sacrificing browser breadth — pay the full price only if the user wants it.
- **vs #9** (per-version sidecars, no git): #9 loses git's `log`/`diff`/`blame` primitives that directly serve F6 (no-loss provenance) and external readability. Without git, every consumer of the corpus has to learn our custom version scheme — directly contradicts F10's externalization goal. Boring-alternative move applied and rejected in stress-test.

**Predicted implementation cost** (soft estimate, not a cap): ~6–8 weeks single-developer or ~250–320 hours, broken roughly as: OPFS adapter + filesystem-abstraction layer (1.5 wk), FSA integration + UX flow for folder selection (1 wk), isomorphic-git integration + commit/push pipeline (1.5 wk), workspace data model migration to folder layout (2 wk), migration from existing localStorage (1 wk), conflict/quota/permission UI states (1 wk), tests + polish (1 wk).

## Pruned candidates and why

*How to read: Each entry is `[candidate-ID]: one-line reason for discard`. Future DDs in adjacent areas (storage, persistence, sync, custom-type lifecycle, workspace export/import) can grep this section to avoid regenerating already-pruned approaches.*

`[1]: ✗ on H2 — manual-zip cross-device burden too high to meet the portability requirement.` `[6]: invert-thesis eliminated — offline-broken plus auth-expiry-mid-edit cost defended the local cache.` `[7]: ✗ on H1 — corpus inside opaque DB rows is not parseable files outside the tool.` `[8]: ✗ on H1 — binary CRDT documents are not parseable by external tools in the F10 sense.` `[10]: H6 weakness — user runs own WebDAV server is operator burden compounded by S1 setup friction.` `[11]: discarded by Diamond 1 chosen framing — null option contradicts architectural-shift goal.` `[12]: organizational-survival risk on single-maintainer project — three sync targets = three failure modes plus three test surfaces.` `[13]: ⚠ on H5 — Electron/Tauri abandons web-only Vercel deployment model.` `[4]: superseded by #4' which adds OPFS cache for browser-breadth without losing #4's corpus property.` `[5]: superseded by #4' which adds the user-visible FSA folder option without losing #5's browser-breadth.` `[9]: boring-alternative considered in stress-test; rejected because loss of git's log/diff/blame primitives forces every consumer of the corpus to learn a custom version scheme — directly contradicts F10's externalization goal.` `Prior pruning grep: no matches found for "persist", "storage", "session", "artifact", "filesystem", "localStorage".`

## Stress-test mitigations

*How to read: each entry below names the stress-test move that produced it and the matrix change it forced. Future grep returns enough context to reapply the move without re-reading the full record.*

- **Boring-alternative mitigation** — comparing #4 against #9 surfaced that git's `log`/`diff`/`blame` primitives are load-bearing for F6 (no-loss provenance) and external readability, not decorative. Retained git in the chosen approach. #9's rejection rationale recorded in Pruned candidates with explicit reasoning so a future re-litigation has the result available without re-running the move.

- **Invert-the-thesis mitigation** — sincerely arguing for #6 (direct-git-push only) forced an explicit defense of why a local cache matters: offline editing (research work in libraries/planes) and auth-expiry mid-edit recovery. Both became hard requirements in the chosen approach: OPFS guarantees offline; the sync queue guarantees auth-failure recovery. These are no longer implicit assumptions.

- **Organizational-survival mitigation** — for a single-maintainer project, #12's three sync targets multiplied risk. The chosen #4' has a single sync pipeline (OPFS → FSA → git remote); the three degraded modes (OPFS-only, FSA-no-remote, full) share the same code path with different terminal stages, not three independent paths.

- **Failure-driven mitigation** — enumerating new failure modes added a hard requirement to the chosen approach: every failure mode must surface in the UI rather than silently degrading. The implementation plan must include a "corpus status" UI element with at least four explicit states: FSA-permission-revoked, OPFS-quota-warning, remote-auth-expired, browser-storage-cleared (FSA-mirror still intact). Silent fallback is disallowed.

## Consequences

**This makes easier:**

- Session switching becomes a data-level operation: switching loads a different workspace folder (or git ref). No in-memory snapshot bridge to keep in sync — *custom-type bleed-across-sessions becomes structurally impossible* because there is no longer a "global custom-type slot in Zustand that survives setState."
- Version history is a property of the corpus (per-version files), not in-memory state — session switch can never flatten it.
- External tooling (`git log artifacts/semiformal/v0007.md`, `grep -r`, `vim`, custom scripts) works on a researcher's corpus without the app running.
- Adding a new artifact type means adding a folder convention, not adding a snapshot/restore field. The class of bug that produced this DD goes away.
- Custom artifact type definitions are versioned alongside their outputs; rolling back a definition rolls back its associated runs through the same git mechanism.
- Each Vercel deployment is single-tenant by design; the trust model is now explicit (browser → FSA folder → git remote — three named, user-chosen surfaces).
- Reproducibility: every artifact can be cited by `(repo-url, commit-sha, path)` triple — F8 (research-corpus citability) is satisfied as a side-effect even though it wasn't the primary framing.

**This makes harder:**

- Initial setup adds steps (pick a folder, optionally configure a git remote) — soft constraint S1 (zero-config) is partially sacrificed for the corpus property. Mitigated by making OPFS-only the zero-config default; FSA and git are opt-in.
- Browser-storage clears now lose work that hasn't been mirrored to the folder or pushed to the remote. Must surface mirror/push status in UI (see failure-driven mitigation above).
- Concurrent edits on two devices can produce git merge conflicts the user must resolve. v1 will use a conservative simplifying rule (per-artifact-file last-write-wins with a warning) and defer richer conflict UI to a follow-up.
- `isomorphic-git` in the browser has performance characteristics that need empirical validation on workspaces with 50–100MB of source PDFs. A spike on this should precede the full implementation.
- Two-stage write path (OPFS → FSA → remote) doubles the failure-mode surface; needs explicit status indicators and retry. (Mitigated by failure-driven move; cost remains.)
- Migration from existing localStorage state is a one-shot conversion; design must include a safe migration path that backs up the old data before deleting it.
- Single-maintainer maintenance cost of `isomorphic-git` as a dependency — bounded by the library's stability and active maintainership (current as of 2026), but a real ongoing tax.
- v1 still allows third-party services on the remote axis (GitHub/GitLab/self-hosted git) — privacy is only "by default" if the user picks a self-hosted remote or stays local-only. S7 (privacy by default) is satisfied for OPFS-only mode; for full mode the user makes the trust trade explicitly.

## Revisit triggers

*How to read: each entry is a concrete, observable condition that should prompt re-evaluating this decision. Future readers can grep this section when their context changes to see whether earlier decisions still apply.*

- if `isomorphic-git` stalls or is abandoned upstream — last release >18 months, or critical CVE without patch within 60 days.
- if Vercel deployment model changes to allow durable server filesystem — would unlock cloud-backed option #7 as a contender.
- if browser FSA support consolidates (Firefox and Safari both ship the API stably) — the OPFS-cache layer's value proposition weakens because FSA alone covers browser breadth.
- if measured cross-device cold-start exceeds 60s p95 in production telemetry.
- if >2 in 10 users in the first month report inability to complete FSA + git-remote setup without out-of-band help.
- if OPFS-only fallback mode is the only mode used by >80% of users after first 3 months — the FSA-corpus property is YAGNI and the design should collapse to #5.
- if researcher-facing workflow requirements demand a stable cloud identifier (e.g., DOI-shaped citations) beyond what `(repo-url, sha, path)` provides — would force adding a registry layer (revives F8 citability framing).
- if browser-git performance hits a cliff on workspace size >50MB (validates one of the candidate-#4' falsifiable counter-evidence triggers).
- if a custom-type-definition history accumulates >1000 versions in a single workspace within 3 months — the in-folder layout's per-version-file scheme may need a packing/compaction step.

---

**Implementation handoff**: per the DD workflow, this decision is the input to a future RPI loop (`research-plan-implement.md`). The plan should reference this record by file path; the rationale here does not need to be duplicated. Suggested early steps for the implementation plan: (1) a timeboxed spike on `isomorphic-git` perf with a 50MB synthetic workspace (validates falsifiable counter-evidence #c), (2) the OPFS + FSA mirror layer in isolation before adding git, (3) migration design from `workspace-zustand-v1`. The pre-existing fix branch `fix/direct-formalize-scroll-and-node-custom-types` is a useful tactical patch for the immediate symptoms; it should be merged into the integration branch on its own merits and is *not* a substitute for this architectural change.
