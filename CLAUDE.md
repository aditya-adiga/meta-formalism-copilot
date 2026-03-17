# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Metaformalism Copilot is a Next.js web app for transforming insights and source material into personalized, context-sensitive formalisms. It's part of the [Live Conversational Threads](https://www.lesswrong.com/posts/uueHkKrGmeEsKGHPR/live-conversational-threads-not-an-ai-notetaker-2) research project. The philosophy ("Live Theory") emphasizes generalization via inclusion — producing multiple rigorous representations tailored to specific contexts rather than a single unified theory.

## Environment

This project runs inside **WSL (Ubuntu on Windows)**. The repo lives at `/home/magfrump/aisc_lct/meta-formalism-copilot/`. When running shell commands, use Linux paths — never Windows paths like `\\wsl.localhost\...` or `C:\`. If you need to invoke something from a Windows context, use `wsl -e bash -c "..."`, but prefer running commands directly in the Linux environment.

Key implications:
- Node, npm, and all tooling are installed in the WSL Ubuntu environment
- File watchers (e.g. `npm run dev`) work but may be slow on files mounted from Windows; the repo should stay on the Linux filesystem
- Git is configured in the WSL environment; use that git, not Windows git

## Commands

All commands run from the repo root (`/home/magfrump/aisc_lct/meta-formalism-copilot/`):

```bash
npm run dev        # Start dev server at localhost:3000
npm run build      # Production build
npm run lint       # ESLint (eslint-config-next with core-web-vitals + typescript)
npm test           # Run tests (Vitest)
npm run test:watch # Run tests in watch mode
npm run test:ui    # Run tests with Vitest UI
```

## Architecture

The app is a **multi-panel workspace** with a collapsible Icon Rail sidebar for navigation. The root `page.tsx` orchestrates all state and renders the active panel via a `PanelShell` layout. State is persisted to localStorage via `useWorkspacePersistence` and survives page refreshes.

### Directory Layout (under `app/`)

- `page.tsx` — Root orchestrator: manages panel navigation, all workspace state, and delegates to panel components
- `layout.tsx` — Sets up fonts (EB Garamond serif + Geist Mono) and metadata
- `globals.css` — CSS variables (`--ivory-cream`, `--ink-black`, `--paper-shadow`) and Tailwind v4 config via `@theme inline`
- `components/layout/` — `PanelShell` (Icon Rail + focus pane layout), `IconRail` (sidebar navigation)
- `components/panels/` — One component per panel: `InputPanel`, `SemiformalPanel`, `LeanPanel`, `GraphPanel`, `NodeDetailPanel`, `CausalGraphPanel`, `StatisticalModelPanel`, `PropertyTestsPanel`, `DialecticalMapPanel`, `AnalyticsPanel`
- `components/features/` — Feature modules organized by domain:
  - `source-input/` — `TextInput`, `FileUpload` (.txt, .doc, .docx, .pdf)
  - `context-input/` — `ContextInput`, `RefinementButtons`, `RefinementPreview`
  - `output-editing/` — `EditableOutput`; `ai-bars/InlineEditPopup` (Cmd+K) and `ai-bars/WholeTextEditBar`
  - `workspace-session/` — `WorkspaceSessionBar` for session switching
  - `session-banner/` — `SessionBanner` for per-panel session context
  - `artifact-selector/` — Artifact type selection UI
  - `causal-graph/` — Graph visualization components
  - `lean-display/` — Lean code display with syntax highlighting
- `components/ui/` — Shared UI components and icons
- `hooks/` — Custom hooks: `useWorkspacePersistence`, `useWorkspaceSessions`, `useFormalizationPipeline`, `useDecomposition`, `useAutoFormalizeQueue`, `useAnalytics`, etc.
- `lib/types/` — TypeScript type definitions for panels, sessions, artifacts, decomposition
- `lib/llm/` — LLM integration (Anthropic SDK, schemas, caching)
- `lib/formalization/` — Shared artifact generation logic
- `lib/utils/` — Utilities (PDF parsing, LaTeX parsing, export, text selection)
- `api/` — Next.js API routes for formalization, editing, verification, decomposition, analytics

### Key Patterns

- **Feature-based folder structure**: components grouped by feature domain, not by type
- **Import alias**: `@/*` maps to the project root (configured in `tsconfig.json`)
- **Client components**: Panel components use `"use client"` since they manage state
- **Multiple artifact types**: semiformal, lean, causal-graph, statistical-model, property-tests, dialectical-map — each with a dedicated panel and API route
- **Decomposition workflow**: extract propositions from sources into a dependency graph, then formalize per-node
- **Session management**: workspace sessions (global) and formalization sessions (per-scope) for tracking artifact history

### Design System

- CSS variables in `globals.css` are the source of truth for theming
- Tailwind CSS v4 with `@tailwindcss/postcss`
- Primary font: EB Garamond (serif); Mono: Geist Mono
- Styling uses both Tailwind classes and `var(--css-variable)` references

## Code Guidelines

- TypeScript for all components
- Tailwind CSS for styling; theme colors via CSS variables in `globals.css`
- Components should be modular and single-responsibility
- Follow existing feature-based folder structure in `app/components/features/`
- Ensure `npm run lint` passes before committing

## Git Workflow

- Always work on feature branches, never commit directly to main
- Commit after each logical unit of work with conventional commit messages (feat:, fix:, refactor:, test:, docs:)
- Push the branch after each commit so work is backed up remotely
- Before finishing a session, ensure all work is committed and pushed
- When asked to prepare for review, do an interactive rebase to clean up WIP commits into logical chunks

## Code Quality

- Tests use Vitest with React Testing Library. Write tests alongside implementation.
- Add comments explaining "why" for non-obvious library usage or architectural choices
- When choosing a new library or significant architectural approach, create a short decision record in `docs/decisions/NNN-title.md` explaining what was chosen and why

## Documentation Maintenance

When making changes that affect user-facing behavior, project structure, or available commands, check whether the following docs need updating:

- `README.md` — UI description, available scripts, prerequisites, project documentation links
- `CLAUDE.md` — Architecture section, directory layout, commands, key patterns
- `docs/ARCHITECTURE.md` — Component hierarchy and technical details
- `CONTRIBUTING.md` — Project structure section, code guidelines

If a PR adds a new panel, artifact type, API route, script, or dependency, update the relevant docs in the same PR.

## PR Preparation

- Generate detailed PR descriptions including: summary of changes, motivation/context, how to test, and areas of uncertainty or risk
- Flag sections where you used unfamiliar libraries or patterns that the reviewer should scrutinize
- Note which tests (if any) cover which functionality
- Keep PRs to one reviewable concept; prefer multiple smaller PRs over one large one