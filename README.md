# Metaformalism Copilot

A workspace for transforming insights, smells and ideas from source materials(ex: conversations, text, etc) into personalized, context-sensitive formalisms.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Faditya-adiga%2Fmeta-formalism-copilot&env=ANTHROPIC_API_KEY&envDescription=Anthropic%20API%20key%20%E2%80%94%20get%20one%20at%20console.anthropic.com&envLink=https%3A%2F%2Fgithub.com%2Faditya-adiga%2Fmeta-formalism-copilot%23deploy-to-vercel&project-name=metaformalism-copilot&repository-name=metaformalism-copilot)

One-click deploys a single-tenant copy with your own Anthropic API key. See [Deploy to Vercel](#deploy-to-vercel) for details and optional env vars.

## What is this?

Metaformalism Copilot is an extension of the [Live Conversational Threads](https://www.lesswrong.com/posts/uueHkKrGmeEsKGHPR/live-conversational-threads-not-an-ai-notetaker-2) research project. Rather than producing unified, context-independent theories, this tool helps generate **pluralistic formalisms** - multiple rigorous representations of the same insight, each tailored to the specific context where it will be used.

### The Philosophy: Live Theory

Instead of generalizing via exclusion (finding what's common and discarding the rest), Live Theory proposes **generalization via inclusion** - acknowledging that abstract concepts may need different formal representations in different contexts. This tool:

- Treats post-rigorous insights as first-class artifacts worthy of formalization
- Enables human-centered AI interaction that supports discernment rather than passive consumption
- Produces formalisms that are sensitive to the local context and research interests of the user
- Emphasizes **iterative improvement** and a **bidirectional approach** - you shape the output through refinement rather than passively accepting what's generated

### How it works

The interface is a **multi-panel workspace** with sidebar navigation. You move between panels via a collapsible Icon Rail on the left edge.

**Input & Decomposition:**
- **Source Panel** — Enter or upload source material (text, .txt, .doc, .docx, .pdf). Describe the theoretical context and select which artifact types to generate.
- **Decomposition Panel** — Extract propositions from your sources into an interactive dependency graph. Each node can be formalized independently with its own context.
- **Node Detail Panel** — Inspect a single proposition: its statement, proof, dependencies, and per-node artifacts.

**Artifact Panels** (each generated from your source + context):
- **Semiformal Proof** — Deductive proof with KaTeX math rendering. Supports inline editing (select text + Cmd+K) and whole-text transformation.
- **Lean4 Code** — Machine-verifiable Lean 4 code generated from the semiformal proof. Includes verification status, AI-assisted error fixing, and manual editing.
- **Causal Graph** — Interactive visualization of variables, causal edges, confounders, and mechanisms.
- **Statistical Model** — Variables with roles, hypotheses, assumptions, and sample requirements.
- **Property Tests** — Invariants with preconditions, postconditions, and pseudocode generators.
- **Balanced Perspectives** — Competing perspectives, tensions, and proposed synthesis.
- **Custom Artifact Types** — Define your own artifact types with custom system prompts. An LLM-assisted designer helps you create the prompt, and the result is generated through a generic formalization route.

**Meta:**
- **Analytics Panel** — Logs of all API calls and summary statistics.

The workspace supports **multiple sessions** — you can create, switch between, rename, and delete independent workspaces. All state persists across page refreshes via localStorage.

Built with Next.js, TypeScript, Tailwind CSS, and ReactFlow.

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (optional, for Lean 4 verification)

### Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the application.

### Lean Verification Service

The app includes a Dockerized Lean 4 verification service. When running, submitted Lean code is type-checked by a real Lean 4 installation. When the service is not running, the app falls back to a mock response.

**Start the verifier:**

```bash
docker compose up --build
```

The first build downloads the Lean 4 toolchain and caches it in the image, so it will take several minutes. Subsequent builds use the Docker cache and are fast.

The verifier runs on port 3100. You can test it directly:

```bash
# Should return { "valid": true }
curl -X POST http://localhost:3100/verify \
  -H 'Content-Type: application/json' \
  -d '{"leanCode":"theorem t : True := trivial"}'

# Should return { "valid": false, "errors": "..." }
curl -X POST http://localhost:3100/verify \
  -H 'Content-Type: application/json' \
  -d '{"leanCode":"theorem t : False := trivial"}'
```

**Configuration:** The Next.js route reads `LEAN_VERIFIER_URL` from the environment. When unset, Lean verification is skipped and the UI shows a "verifier offline — proof not checked" badge so it's clear no checking happened. Set this to `http://localhost:3100` for local dev with the Docker Compose verifier above.

**Stop the verifier:**

```bash
docker compose down
```

The rest of the app keeps working without the verifier. Lean code can still be generated and edited; only the type-check step is skipped.

## Deploy to Vercel

Each user runs their own single-tenant deployment with their own Anthropic API key. The "Deploy with Vercel" button at the top of this README walks you through it.

### Required environment variable

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com — create a key with API access. |

### Optional environment variables

You can leave these unset on first deploy and add them later from the Vercel dashboard (`Settings → Environment Variables`).

| Variable | Effect when set | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | Routes some calls through OpenRouter for non-Anthropic models. | **Privacy note:** prompts (including your source material) are sent to OpenRouter for those calls. Leave unset to keep all LLM traffic on Anthropic. |
| `LEAN_VERIFIER_URL` | Enables Lean 4 type-checking. | The verifier is a separate Docker service (see [Lean Verification Service](#lean-verification-service)). Vercel cannot host it directly; deploy it on Railway/Render/Fly.io and set this to its URL. Without it, Lean code is generated but not checked. |
| `OPENALEX_MAILTO` | Identifies your evidence-search calls to the OpenAlex API ([polite pool](https://docs.openalex.org/how-to-use-the-api/rate-limits-and-authentication#the-polite-pool)). | Recommended but not required. |

### What works on Vercel out of the box

- All LLM-driven flows: semiformal proofs, Lean code generation, edits, decomposition, evidence search.
- Workspace persistence (your data stays in the browser via localStorage).

### What does not work without extra setup

- **Lean verification** — needs `LEAN_VERIFIER_URL` pointing at a running verifier (see above).
- **Persistent analytics history** — analytics is local-dev-only; on Vercel each cold start gets a fresh log.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm test` - Run tests (Vitest)
- `npm run test:watch` - Run tests in watch mode
- `npm run test:ui` - Run tests with Vitest UI

## How to Contribute

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines on branching, code style, and the PR process.

## Project Documentation

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - Technical structure, component hierarchy, and implementation details
- [USER_GUIDE.md](./docs/USER_GUIDE.md) - Walkthrough of all features with step-by-step instructions
- [docs/decisions/](./docs/decisions/) - Architectural decision records
- [docs/thoughts/](./docs/thoughts/) - Working notes and exploration logs

## Questions or Issues?

Feel free to open an issue for bugs, feature requests, or questions about the codebase.

## License

Need to figure this out
