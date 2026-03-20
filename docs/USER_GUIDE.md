# Metaformalism Copilot — User Guide

This guide walks through the features of Metaformalism Copilot, organized as actions you can take and what you'll see as a result.

## Quick Start

1. Run `npm run dev` and open [http://localhost:3000](http://localhost:3000).
2. The workspace opens to the **Source Input** panel with a collapsible sidebar (the **Icon Rail**) on the left.
3. Enter some text, choose an artifact type, and click **Formalise** to generate your first formalization.

---

## Navigating the Workspace

The left sidebar (Icon Rail) lists every panel. Click an icon to switch panels.

- **Collapse/expand** the sidebar by clicking the chevron at the top. Collapsed mode shows only icons; expanded mode shows labels and status summaries.
- A thin bar on the rail highlights the active panel.
- Status summaries (e.g., "verified", node count) appear next to panel labels when the sidebar is expanded.

### Panels

| Panel | Purpose |
|-------|---------|
| Source Input | Enter text, upload files, set context, select artifact types, trigger formalization |
| Decomposition | View and interact with the proposition dependency graph |
| Node Detail | Inspect and formalize a single proposition node |
| Semiformal Proof | View and edit the generated deductive argument |
| Lean4 Code | View, verify, and iterate on machine-verifiable Lean 4 code |
| Causal Graph | View and edit causal variable/edge diagrams |
| Statistical Model | View and edit hypothesis/variable specifications |
| Property Tests | View and edit invariant/test specifications |
| Dialectical Map | View and edit multi-perspective argument maps |
| Counterexamples | View and edit adversarial scenario analysis |
| LLM Usage | See API call metrics, token counts, and costs |

---

## Providing Source Material

### Typing or pasting text

1. On the **Source Input** panel, type or paste into the **Text Input** area.
2. The text is available immediately for formalization or decomposition.

### Uploading files

1. Click the file upload area or drag files onto it.
2. Supported formats: `.txt`, `.md`, `.markdown`, `.tex`, `.docx`, `.pdf`.
3. Each file shows an extraction status indicator:
   - **Extracting** — file is being processed.
   - **Ready** — extraction complete; character count displayed.
   - **Error** — extraction failed (e.g., `.doc` files are not supported; use `.docx`).
4. Remove a file with the **✕** button next to it.
5. Uploaded file names persist across tab switches and page refreshes. (The extracted text is restored from local storage; the original file objects are not.)

### LaTeX files

If you upload a `.tex` file containing `\begin{theorem}`, `\begin{lemma}`, or similar environments, propositions are extracted directly without an LLM call.

### TeX-compiled PDFs

PDFs compiled from LaTeX (math papers) are parsed deterministically when possible. Non-TeX PDFs fall back to LLM-based extraction.

---

## Direct Formalization (Global Mode)

This is the simplest path: source material in, formalized artifacts out.

### 1. Set context (optional)

In the **Direct Formalization** section of the Source Input panel, describe the theoretical domain (e.g., "category theory", "game-theoretic setting"). Context helps the AI tailor the output.

### 2. Select artifact types

Click one or more artifact type chips:

| Chip Label | What It Generates |
|------------|-------------------|
| **Deductive (Lean)** | A semiformal proof with mathematical notation, followed by machine-verifiable Lean 4 code |
| **Causal Graph** | A directed graph of variables and causal relationships with weights and confounders |
| **Statistical Model** | Variables with roles, testable hypotheses, suggested statistical tests, and assumptions |
| **Property Tests** | Invariants with preconditions, postconditions, pseudocode, and data generators |
| **Dialectical Map** | Multiple perspectives on a topic, tensions between them, and a proposed synthesis |
| **Counterexamples** | Adversarial scenarios that could falsify the claim, with plausibility ratings |

Click **Browse types** for detailed descriptions and "when to use" guidance.

### 3. Click Formalise

- The button shows **"Formalising... ~Xs"** with a progress bar during generation.
- When the estimate expires before the call returns, it shows **"any moment..."**.
- Generated artifacts appear in their respective panels. Navigate to them via the sidebar.

### 4. Review results

Switch to the relevant panel to see the output. For the deductive pipeline, semiformal output appears first — Lean code is generated as a separate step (see [Working with Lean Code](#working-with-lean-code) below).

---

## Decomposition (Graph Mode)

For longer or multi-source material, decompose into individual propositions first, then formalize each one.

### Extracting propositions

1. Add source material (text and/or files) in the Source Input panel.
2. Click **"Decompose N Sources"** (the button label reflects how many sources you've provided).
3. A progress indicator shows extraction progress with a time estimate.
4. When complete, switch to the **Decomposition** panel to see the graph.

### Reading the graph

- **Nodes** represent propositions (definitions, lemmas, theorems, claims, etc.). Each shows a label, kind tag, and verification status.
- **Edges** show dependency relationships between propositions.
- When multiple source documents are present, nodes are **color-coded by source** and a legend appears.
- Cross-document dependencies are supported — propositions from different files can depend on each other.

### Selecting a node

Click a node in the graph to open the **Node Detail** panel, which shows:

- The proposition **statement** and **proof text**
- **Dependencies** (with their verification status)
- **Source document** label
- Any previously generated artifacts for this node

### Formalizing individual nodes

In the Node Detail panel:

1. Optionally set per-node **context** (overrides the global context for this node).
2. Select artifact types.
3. Click **"Formalise"** to generate artifacts for this node only.
4. For the deductive pipeline, click **"Generate Lean4 Code"** after reviewing the semiformal output.

### Batch formalization (Formalize All)

1. In the Decomposition panel, click **"Formalize All"**.
2. Select which artifact types to generate.
3. The queue processes nodes in **dependency order**:
   - A progress bar shows completed / failed / skipped / total.
   - **Pause** stops after the current node finishes. **Resume** continues from where it left off.
   - **Cancel** stops the queue entirely.
   - If a node fails, its dependents are automatically **skipped** (with a reason shown).
4. While the queue is running, per-node "Formalise" buttons are disabled to prevent conflicts.

---

## Working with the Semiformal Proof

The Semiformal Proof panel has two views:

### Rendered view (default)

Displays the proof with:
- LaTeX-rendered math (both `$inline$` and `$$display$$` notation)
- Markdown formatting (headings, lists, bold, tables, horizontal rules)
- Boxed expressions (`$$\boxed{...}$$`)

### Raw edit mode

Click **"Edit"** to switch to a raw text editor. Click **"Done editing"** to return to rendered view. Editing does not automatically switch back to rendered mode — you stay in edit mode until you explicitly click Done.

### Inline AI editing (Cmd/Ctrl + K)

1. Switch to raw edit mode.
2. Select a portion of the text.
3. An **"Edit with AI"** button appears (or press **Cmd/Ctrl + K**).
4. A popup shows the selected text and an instruction field.
5. Type your instruction (e.g., "Make this step more rigorous") and submit.
6. The AI applies the edit to just the selected region and returns to rendered view.

### Whole-text AI editing

A bar at the bottom of the panel accepts high-level directives that rewrite the entire proof:
- Example: "Restructure with clearer step numbering" or "Add more intermediate steps."

### Regenerating after edits

If you edit the semiformal proof after Lean code has been generated, the Lean panel shows a **"Regenerate"** banner indicating the Lean code is out of date. Click it to regenerate.

---

## Working with Lean Code

### Generation

Lean 4 code is generated from the semiformal proof as a separate step:

1. After semiformal output is ready, click **"Generate Lean4 Code"** in the Semiformal panel (or in the Node Detail panel for per-node mode).
2. The Lean4 Code panel shows progress during generation and verification.

### Verification

A badge in the panel header shows the status:
- **Valid ✓** — the code type-checks successfully.
- **Invalid ✗** — verification failed; errors are displayed.
- **Verifying...** — verification is in progress.
- **None** — no verification has been attempted.

Verification runs against a Dockerized Lean 4 service (see [Lean Verification Service](#lean-verification-service)). If the service is not running, a mock "valid" response is returned.

### Editing and re-verifying

1. Edit the Lean code directly in the panel.
2. Click **"Re-verify"** to run verification again on your edited code.

### Fixing errors with AI

When verification fails:
- An error display shows the Lean compiler output.
- **"Explain this error"** — click for a plain-language explanation of the error.
- **"Fix with AI"** — the AI attempts to fix the code automatically and re-verifies.

### Iteration workflow

The typical cycle is:
1. Generate Lean from semiformal proof.
2. If invalid, choose to: edit manually, use "Fix with AI", or go back and revise the semiformal proof and regenerate.

For decomposition mode, when a node depends on other verified nodes, their Lean code is included as context during generation.

---

## Working with Other Artifact Types

The Causal Graph, Statistical Model, Property Tests, Dialectical Map, and Counterexamples panels all share a common interaction pattern:

### Viewing

Each panel displays structured output with labeled sections (e.g., Variables, Edges, Hypotheses, Perspectives, etc.).

### Inline editing

Click any field to edit it directly. Changes are saved in place.

### AI-assisted editing

Use the editing bar to request AI refinements to the artifact's content.

### Causal Graph — graph view

The Causal Graph panel has two views:
- **Graph** — interactive directed graph visualization with:
  - Edge colors: green for positive relationships, red for negative.
  - Edge thickness scales with relationship magnitude.
  - Confounders shown with amber border and "confounder" badge.
- **Details** — structured list of variables, edges, confounders, and summary.

Toggle between views with the **Graph / Details** tabs.

### Counterexamples — plausibility ratings

Each counterexample has a plausibility rating (high / medium / low) shown with color coding, plus a robustness assessment of the overall claim.

---

## Session Management

### Workspace sessions

The top bar shows your current workspace session.

- **Rename**: click the session title to edit it.
- **Switch**: use the dropdown to move between sessions.
- **New**: create a fresh workspace with default state.
- **Delete**: remove a session.
- Timestamps show when each session was last updated.
- **Busy guard**: you cannot switch sessions while an LLM call is in progress. A warning modal appears if you try.

### Formalization sessions (per-panel history)

Each formalization run creates a **session** scoped to either global or a specific node.

- A **Session Banner** in the Semiformal and Lean panels shows the current session (e.g., "Global — Run #1" or "Node Label — Run #2").
- A **status dot** indicates verification state (green = verified, red = invalid, yellow = verifying, grey = none).
- Click the dropdown to switch between past runs — the full state (semiformal text, Lean code, verification status, all artifacts) is restored.
- Sessions persist across page refreshes.

---

## Exporting Artifacts

### Per-artifact exports

| Artifact | Button | Output |
|----------|--------|--------|
| Semiformal Proof | **Export .md** | Markdown file |
| Lean4 Code | **Export .lean** | Lean source file |
| Decomposition Graph | **Export .png** | Graph visualization as PNG image |

Buttons appear only when the corresponding content exists.

### Export All

The **Export All** button at the bottom of the sidebar downloads a `.zip` file containing:
- Semiformal proofs (`.md`)
- Lean code (`.lean`)
- Structured artifacts (causal graph, statistical model, etc.) as `.json` files
- Decomposition graph (`.png`)
- Per-node folders with individual node artifacts

---

## LLM Usage Analytics

Switch to the **LLM Usage** panel to see:

- **Summary cards**: total API calls, token usage, estimated cost, average latency.
- **Detailed log table**: per-call metrics (timestamp, endpoint, model, tokens in/out, cost, latency) in reverse chronological order.
- **Clear Session**: resets all analytics data.

Analytics persist across page refreshes.

---

## Persistence

All workspace state is saved to **localStorage** automatically:
- Source text and extracted file content
- Context descriptions
- Generated artifacts (all types)
- Decomposition graph and node states
- Workspace and formalization sessions
- Analytics data

Refreshing the page restores your full workspace state. Switching sessions also restores all state for that session.

---

## Lean Verification Service

For real Lean 4 verification (instead of mock responses):

```bash
# Start the verifier (first build downloads Lean toolchain — takes several minutes)
docker compose up --build

# Stop the verifier
docker compose down
```

The verifier runs on port 3100. The app automatically detects whether it's available and falls back to mock responses when it's not.

---

## Keyboard Shortcuts

| Shortcut | Context | Action |
|----------|---------|--------|
| **Cmd/Ctrl + K** | Raw edit mode with text selected | Open inline AI edit popup |
