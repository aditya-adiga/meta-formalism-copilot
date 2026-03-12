# Contributing to Metaformalism Copilot

Thank you for your interest in contributing! This document explains how to get started and what we expect from contributions.

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (optional, for Lean 4 verification)

### Setup

```bash
git clone https://github.com/aditya-adiga/meta-formalism-copilot.git
cd meta-formalism-copilot
npm install
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

For Lean 4 verification, start the Docker service:

```bash
docker compose up --build
```

See the [README](./README.md) for more details on the verifier.

## Development Workflow

### Branching

1. **Always branch from `main`** — never commit directly to `main` or `dev`.
2. Use descriptive branch names with a prefix:
   - `feat/` for new features
   - `fix/` for bug fixes
   - `refactor/` for refactoring
   - `docs/` for documentation changes
3. Push your branch after each commit so work is backed up remotely.

### Making Changes

1. Create your branch:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feat/your-feature-name
   ```

2. Make your changes following the [code guidelines](#code-guidelines) below.

3. Run the linter:
   ```bash
   npm run lint
   ```

4. Run tests (if applicable to your change):
   ```bash
   npm test
   ```

5. Commit with conventional commit messages:
   ```bash
   git commit -m "feat: add new feature description"
   ```

6. Push and open a Pull Request:
   ```bash
   git push -u origin feat/your-feature-name
   ```

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `refactor:` — code restructuring without behavior change
- `test:` — adding or updating tests
- `docs:` — documentation only
- `chore:` — tooling, dependencies, CI config

## Code Guidelines

### General

- **TypeScript** for all components and modules.
- **Tailwind CSS** for styling; theme colors via CSS variables in `globals.css`.
- Components should be modular and focused on a single responsibility.
- Follow the existing feature-based folder structure in `app/components/features/`.
- Add comments explaining "why" for non-obvious decisions — reviewers may not share your context.

### Project Structure

- `app/components/features/` — Feature modules grouped by domain (not by component type).
- `app/components/ui/` — Shared, reusable UI components.
- `app/components/panels/` — Top-level panel orchestration.
- `app/lib/` — Utilities and shared logic.
- `app/api/` — Next.js API routes.

### Import Aliases

Use `@/*` for imports from the project root (configured in `tsconfig.json`):

```typescript
import { SomeComponent } from "@/app/components/features/some-feature/SomeComponent";
```

## Before Submitting a PR

- [ ] `npm run lint` passes without errors
- [ ] `npm test` passes (if tests exist for your changes)
- [ ] The UI works correctly at common screen sizes
- [ ] No `console.log` or debug code left in
- [ ] All imports use correct paths
- [ ] Commit history is clean — squash WIP commits into logical units

## Pull Request Process

1. Fill out the PR description with: summary of changes, motivation, how to test, and any areas of uncertainty.
2. PRs are merged into `main` after review.
3. Keep PRs focused on one reviewable concept — prefer multiple small PRs over one large one.

## Reporting Issues

Open a [GitHub issue](https://github.com/aditya-adiga/meta-formalism-copilot/issues) for bugs, feature requests, or questions about the codebase.

## Project Documentation

- [README.md](./README.md) — Overview and quick start
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — Technical structure and component hierarchy
- [docs/decisions/](./docs/decisions/) — Architectural decision records
