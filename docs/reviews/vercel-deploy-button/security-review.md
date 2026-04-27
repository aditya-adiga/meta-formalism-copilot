# Security Review: feat/vercel-deploy-button

**Commit:** 4329d6ebb9717d1d4f5bbb81ad543554e8136f73
**Branch:** feat/vercel-deploy-button (vs `origin/main`)
**Scope:** docs-only diff — `README.md`, `CLAUDE.md`. The security-sensitive surface is the
`vercel.com/new/clone?...` button URL and the env-var guidance it sets up.
**Fact-check input:** `docs/reviews/vercel-deploy-button/code-fact-check-report.md` (used as
foundation for behavioral claims).

## Trust Boundary Map

This diff does not change executable trust boundaries — no API routes, auth, input handling,
or crypto are modified. The relevant boundaries are documentation-driven:

1. **README → user's browser → vercel.com.** A user clicks the deploy button. The URL controls
   which repo Vercel clones into the user's account and which env-var prompts appear during
   onboarding. A typo or attacker-influenced URL here funnels every new self-hoster into a
   malicious fork.
2. **README guidance → user's secret handling.** The doc tells users where to put
   `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY`. Bad guidance (e.g., "paste it in the URL", "commit
   `.env`", "share it via …") would directly cause secret exposure. The diff must not introduce
   such patterns.
3. **OpenRouter privacy framing.** When `OPENROUTER_API_KEY` is set and `ANTHROPIC_API_KEY` is
   not, user-supplied source material (which may be private/proprietary) is sent to a third
   party. The doc must accurately disclose this.

## Findings

No findings at Medium or higher. The diff is correctly scoped and the security-sensitive
strings (deploy URL, env-var names, third-party links) all check out.

#### URL-decode of the deploy button (verification, not a finding)

Decoding `README.md:5`:

| Param | Value |
|---|---|
| `repository-url` | `https://github.com/aditya-adiga/meta-formalism-copilot` |
| `env` | `ANTHROPIC_API_KEY` |
| `envDescription` | `Anthropic API key — get one at console.anthropic.com` |
| `envLink` | `https://github.com/aditya-adiga/meta-formalism-copilot#deploy-to-vercel` |
| `project-name` | `metaformalism-copilot` |
| `repository-name` | `metaformalism-copilot` |

- `repository-url` matches the project's actual `origin` remote
  (`https://github.com/aditya-adiga/meta-formalism-copilot.git`). Confirmed via `git remote -v`.
  No homoglyph/typosquat (`adiga`/`adiga-adiga` etc.).
- `env=ANTHROPIC_API_KEY` is the only required env var. This matches the code: `callLlm.ts:112`
  and `streamLlm.ts:87` are the only required-key gates; `OPENROUTER_API_KEY` is strictly a
  fallback, and `LEAN_VERIFIER_URL` is optional. Vercel will not prompt for OpenRouter or the
  verifier URL during onboarding, which is the correct behavior — the user shouldn't be
  required to give a key to an additional third party to get a working install.
- `envLink` resolves: the in-doc anchor `## Deploy to Vercel` (README.md:98) produces the
  GitHub anchor `#deploy-to-vercel`. No 404.
- `envDescription` references `console.anthropic.com` (the legitimate Anthropic console
  domain). Hosted as plain text in the description, not a clickable link, so even if it were
  wrong it could not silently misdirect — but it is in fact correct.
- The button image `https://vercel.com/button` is Vercel-vendored.

#### [Informational] No instruction to paste keys anywhere unsafe

**Severity:** Informational
**Location:** `README.md:98-120`, `CLAUDE.md:69-77`
**Move:** #6 (Follow the secrets)
**Confidence:** High

The new docs tell users to enter `ANTHROPIC_API_KEY` via Vercel's onboarding prompt and to add
`OPENROUTER_API_KEY` later via "Settings → Environment Variables". Both are the correct
secret-storage locations on Vercel. There is no guidance to paste keys into chat, into source,
into the URL, or into `vercel.json`. The CLAUDE.md addition explicitly states "There is no
in-browser BYO-key flow; keys live in the Vercel project's environment variables (or
`.env.local` in dev)" — this is the right framing and discourages users from adding key inputs
to the UI.

No action required; noted to confirm the move is satisfied.

#### [Informational] OpenRouter privacy disclosure is accurate

**Severity:** Informational
**Location:** `README.md:114`
**Move:** #6 (Follow the secrets) / privacy disclosure
**Confidence:** High

The note "prompts (including your source material) are sent to OpenRouter when this path is
used" is accurate. The fact-check report (Claim 3) confirms `userContent` in
`callLlm.ts:170-178` is unmodified user-supplied content forwarded to OpenRouter, and the same
pattern holds in `streamLlm.ts:253` (`Authorization: Bearer ${opts.apiKey}` with the user
content in the body). Users cannot reasonably miss the privacy implication — the warning is
in-line with the env-var description and uses the same emphasis (`**Privacy note:**`).

One minor consideration for completeness, not a defect: the doc does not call out that the
Anthropic path also sends source material to a third party (Anthropic). This is normal and
expected for an Anthropic-API client, but a user reading only the OpenRouter privacy note
might infer that the Anthropic path is local. Given the README's broader framing
("personalized formalisms" generated by an LLM) this is unlikely to cause confusion; flagging
only because the asymmetry of disclosure could read as if Anthropic is privacy-preserving
relative to OpenRouter. Optional clarification: a one-line note that source material goes to
the configured LLM provider in either case.

#### [Informational] Mock-valid Lean verifier behavior is now documented (closes a prior silent-pass concern)

**Severity:** Informational
**Location:** `README.md:64`, `README.md:88`, `README.md:96`, `README.md:115`, `CLAUDE.md:76`
**Move:** #3 (Check the error path)
**Confidence:** High

The pre-diff README said "the app falls back to a mock response" without flagging that the
mock returns `valid: true`. The new wording is explicit: "this means generated Lean code is
reported as valid without actually being type-checked" and "the type-check step returns the
mock-valid response". The fact-check report (Claims 5, 6) confirms there is no UI distinction
between mock and real validation in `useFormalizationPipeline.ts:121` and
`LeanCodeDisplay.tsx`. The doc improvement is the correct mitigation for a docs-only PR;
fixing the silent-pass in code is out of scope for this branch.

Not a security defect of this PR. Surfacing here because the pre-diff README arguably was a
defect (silent-pass undisclosed) and this PR fixes that disclosure.

#### [Informational] CLAUDE.md `/tmp` claim is technically wrong but not security-relevant

**Severity:** Informational
**Location:** `CLAUDE.md:77`
**Move:** N/A — flagged via fact-check report Claim 7
**Confidence:** High

The fact-check report flags that `CLAUDE.md` says Vercel writes "can only write to `/tmp`",
but the code actually writes to `process.cwd()/data/...`, which is read-only on Vercel. Writes
fail with `EROFS`/`EACCES` and are swallowed by `try/catch` (`callLlm.ts:84-91`,
`streamLlm.ts:55-62`). This is a correctness issue in the doc, not a security issue: in either
case the analytics/cache data does not persist. There is no scenario where the wrong framing
leads a user to write secrets somewhere unsafe. Out of scope for security review; mentioned
only because the fact-check report flagged it.

## What Looks Good

- **Repository URL is vendor-pinned and matches `origin`.** No typosquatting risk.
- **Single required env var.** Only `ANTHROPIC_API_KEY` is required at deploy time. This is
  consistent with the actual code (the only path that requires no key is the mock fallback).
  Asking for `OPENROUTER_API_KEY` up front would force users to onboard with two third
  parties; this URL correctly defers it to optional later configuration.
- **`envLink` resolves and points at content the project controls.** The README anchor
  `#deploy-to-vercel` (line 98) is real, and the linked content does not contain
  outbound-redirect patterns.
- **`envDescription` references the correct Anthropic domain.** `console.anthropic.com` is the
  legitimate console; no homoglyph attack vector.
- **Privacy note on OpenRouter is direct and bolded.** Hard to miss.
- **No copy-paste secret-handling antipatterns.** No "paste your key here", no `.env`
  commit-and-push pattern, no key-in-URL guidance.
- **CLAUDE.md re-asserts single-tenant assumption.** "There is no in-browser BYO-key flow;
  keys live in the Vercel project's environment variables (or `.env.local` in dev)" — this
  is the right operational stance and prevents future contributors from adding a UI key field
  without considering the threat model.
- **Mock-valid verifier behavior is now disclosed in user-visible docs.** A user evaluating
  whether Lean output can be trusted now has the information they need without reading source.

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 1 | Deploy URL clones correct repo, prompts only for required key, env link resolves | Verified (no defect) | `README.md:5` | High |
| 2 | Env-var guidance does not introduce unsafe handling patterns | Informational | `README.md:98-120`, `CLAUDE.md:69-77` | High |
| 3 | OpenRouter privacy disclosure is accurate (Anthropic-path disclosure asymmetric but minor) | Informational | `README.md:114` | High |
| 4 | Mock-valid verifier behavior now documented (closes silent-pass disclosure gap) | Informational | `README.md:64,88,96,115`, `CLAUDE.md:76` | High |
| 5 | CLAUDE.md `/tmp` claim is wrong (correctness, not security) | Informational | `CLAUDE.md:77` | High |

## Overall Assessment

The security-sensitive surface area of this docs-only PR is the deploy button URL and the
env-var guidance it ushers users into. Both check out: the cloned repo URL matches `origin`,
the env-var name is the canonical required key (verified against `callLlm.ts:112` and
`streamLlm.ts:87`), the env link resolves to a real anchor on the project's own README, and
the description points at the legitimate Anthropic console. The OpenRouter privacy note is
correctly scoped and emphatic. There is no guidance that would lead a self-hoster into bad
secret-handling practice. The PR also closes a small pre-existing disclosure gap by making the
mock-valid Lean verifier behavior explicit.

The single most important thing to address: nothing security-relevant. If a follow-up is
desired, consider mentioning that the Anthropic path also sends source material to a third
party so the privacy framing is symmetric — but this is optional polish, not a defect.
