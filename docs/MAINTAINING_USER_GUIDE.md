# Maintaining the User Guide

This document explains how to keep `docs/USER_GUIDE.md` and `docs/example-workspace.json` up to date as the app evolves.

## When to update

Update the user guide when a PR:

- **Adds a new panel or artifact type** — add a row to the panels table and a new walkthrough section.
- **Changes user-visible behavior** — e.g., renames a button, changes a workflow, adds a keyboard shortcut.
- **Removes a feature** — remove the corresponding section so the guide doesn't reference nonexistent UI.
- **Changes persistence format** — update the example workspace JSON to match.

The CLAUDE.md "Documentation Maintenance" section already lists `docs/USER_GUIDE.md` as a doc to check. Treat it the same as README.md and ARCHITECTURE.md.

## How to update with Claude Code

You can ask Claude Code to update the guide using a prompt like:

```
Review the merged PRs since the last update to docs/USER_GUIDE.md. For each PR
that changes user-visible behavior:

1. Check whether USER_GUIDE.md already covers the new behavior.
2. If not, add or update the relevant section.
3. If a feature was removed or renamed, update or remove the old section.

Focus on user actions leading to visible results. Do not include:
- Build/lint/type-check steps (developer-only)
- Internal refactoring details
- Mock fallback or error recovery testing
- Duplicate items — consolidate into one description

Use the test plan sections from PRs as a starting point for walkthrough items,
but filter out items that are developer-facing or already covered.
```

## How to update the example workspace

The example workspace (`docs/example-workspace.json`) should contain realistic, pre-generated results for every artifact type so the app can be demonstrated without API keys.

### When to update

- A new artifact type is added (add a populated example to the JSON).
- The persistence format changes (update field names/shapes to match `PersistedWorkspace`).
- An artifact type is removed (remove its entry).

### How to generate fresh example data

The easiest approach:

1. Run the app with a valid API key.
2. Enter the example source text from the current `example-workspace.json` (or new text if the example topic is changing).
3. Generate all artifact types.
4. Open the browser console and run:
   ```js
   copy(JSON.stringify({
     "workspace-v2": JSON.parse(localStorage.getItem("workspace-v2")),
     "workspace-sessions-v1": JSON.parse(localStorage.getItem("workspace-sessions-v1"))
   }, null, 2))
   ```
5. Paste the result into `docs/example-workspace.json`.
6. In the `workspace-sessions-v1` section, you can replace the duplicated workspace data with the string `"__SAME_AS_WORKSPACE_V2_ABOVE__"` — the loader script handles the substitution.

Alternatively, ask Claude Code:

```
Update docs/example-workspace.json to include example data for the new
[artifact type]. Use the same source text ("Regular exercise has a protective
effect against cognitive decline...") and generate realistic example output
that matches the schema in app/lib/llm/schemas.ts. Make sure the JSON matches
the PersistedWorkspace type in app/lib/types/persistence.ts.
```

### Loading the example workspace

```bash
node scripts/load-example-workspace.mjs
```

If Puppeteer is not installed, the script prints a JS snippet to paste into the browser console at `http://localhost:3000`.

## Structure of the user guide

The guide is organized by **user workflow**, not by component hierarchy:

1. **Quick Start** — minimal steps to see something work
2. **Navigation** — how to move around the workspace
3. **Source Input** — entering and uploading material
4. **Direct Formalization** — the simplest end-to-end flow
5. **Decomposition** — the graph-based flow for complex material
6. **Per-artifact sections** — editing, verifying, iterating on each type
7. **Cross-cutting features** — sessions, export, analytics, persistence

When adding a new feature, place it in the section that matches the user's mental model, not necessarily where it lives in the code.

## Validating the guide

After updating, check:

- [ ] Every panel listed in `usePanelDefinitions.tsx` has a corresponding entry
- [ ] Every artifact type in `ARTIFACT_META` (in `artifacts.ts`) is described
- [ ] The example workspace JSON matches the `PersistedWorkspace` type
- [ ] The loader script runs without errors: `node scripts/load-example-workspace.mjs`
- [ ] Button labels and keyboard shortcuts match the current codebase (grep for them)
