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

The interface supports a collaborative, iterative workflow:

- **Left Panel**: Enter source material (insights, research notes, conceptual material) and describe the theoretical context or domain for formalization. Refine your context description iteratively before generating output.
- **Right Panel**: View the generated formalism and actively shape it through AI-assisted editing:
  - Edit selected portions with inline instructions
  - Transform the entire output with high-level directives
  - Manual editing combined with AI suggestions

This bidirectional approach ensures you remain an active participant in the formalization process, not a passive consumer of AI output.

Built with Next.js, TypeScript, and Tailwind CSS.

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (for Lean 4 verification)

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

## How to Contribute

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines on branching, code style, and the PR process.

## Project Documentation

For detailed documentation, see the [`documentation/`](./documentation) folder:

- [BACKGROUND.md](./documentation/BACKGROUND.md) - Theoretical foundation, Live Theory philosophy, and research context
- [ARCHITECTURE.md](./documentation/ARCHITECTURE.md) - Technical structure, component hierarchy, and implementation details

## Questions or Issues?

Feel free to open an issue for bugs, feature requests, or questions about the codebase.

## License

Need to figure this out
