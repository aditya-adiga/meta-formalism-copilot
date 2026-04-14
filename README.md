# Metaformalism Copilot

A workspace for transforming insights, smells and ideas from source materials(ex: conversations, text, etc) into personalized, context-sensitive formalisms.

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
- **Dialectical Map** — Competing perspectives, tensions, and proposed synthesis.
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

**Configuration:** The Next.js route reads `LEAN_VERIFIER_URL` from the environment (defaults to `http://localhost:3100`).

**Stop the verifier:**

```bash
docker compose down
```

The app continues to work without the verifier — the API route falls back to a mock `{ valid: true, mock: true }` response.

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
