# User Research Setups

_Structured scenarios for testing with real users to inform feature design and prioritization. Each setup describes what you prepare, what you ask the user to do, and what you observe._

---

## Setup 1: "Formalize My Claim" — End-to-End Flow Test

### Purpose
Understand the baseline user experience. Answer Q2 (push-button vs. steering) and Q3 (verification failure response).

### Preparation
- Have the app running with API keys configured
- Lean verifier running (or mock if unavailable — note which)
- Prepare 2-3 short mathematical claims of varying difficulty:
  - **Easy:** "The sum of two even numbers is even"
  - **Medium:** A paragraph from a published math paper (e.g., a lemma statement + informal proof sketch)
  - **Hard:** A multi-step argument from an alignment research post that mixes formal and informal reasoning

### Protocol
1. Hand the user the app with no instructions beyond "this tool turns informal math into verified Lean4 proofs."
2. Ask them to paste the **easy** claim into the source panel and try to get a verified Lean proof.
3. Observe silently. Note:
   - Do they find the "Formalise" button? How long does it take?
   - Do they use the context panel? If so, what do they write?
   - When they reach the Lean panel, do they read the code? Try to edit it?
   - If verification fails, what do they do? (Give up? Try "Fix with AI"? Edit manually? Try again?)
4. After the easy claim, give them the **medium** one. Same observation.
5. Debrief questions:
   - "What did you expect to happen at each step?"
   - "Was there a point where you felt stuck or unsure what to do next?"
   - "What would you have wanted to tell the AI that you couldn't?"
   - "If you could change one thing about the experience, what would it be?"

### What This Tells You
- Whether the current flow is discoverable without guidance (informs #10 onboarding)
- Whether users want more control (informs #11 strategy suggestions, #15 annotation)
- How users handle failure (informs #2 conversation threads, #5 version history)

---

## Setup 2: "Context Matters" — The Multi-Audience Test

### Purpose
Test whether multi-context formalization (#1) resonates. Answer Q1 (what do users write as context?) and Q6 (how many contexts?).

### Preparation
- Prepare one medium-complexity mathematical statement (something that could be formalized in multiple ways — e.g., a theorem about groups that could use algebraic or categorical language)
- Pre-wire the context panel to actually influence output (fix #3 first, or simulate by manually adjusting prompts)
- Have 3-4 context prompts ready as suggestions:
  - "For an undergraduate algebra student"
  - "For a category theorist"
  - "Using only constructive logic"
  - "Emphasizing computational content"

### Protocol
1. Show the user the source text already loaded. Explain: "This tool generates formal proofs, and you can provide context to change how it formalizes."
2. Ask: "Before we start — if you were going to formalize this for different audiences or purposes, what would those be?" Write down their answers verbatim.
3. Have them formalize with no context first. Save the result.
4. Now have them add one of their own context descriptions (or a suggested one) and formalize again.
5. Show both results side by side. Ask:
   - "Are these meaningfully different?"
   - "Is the difference what you expected?"
   - "Would you want to generate more versions? How many before it stops being useful?"
   - "How would you want to compare them — side by side? Overlaid? Diff view?"
6. If time allows, repeat with a second context.

### What This Tells You
- Whether "generalization via inclusion" is intuitive to users (core Live Theory thesis)
- What "context" means to different users (audience? formalism? logical framework?)
- Whether comparison is a feature they'd use or a feature they'd skip
- Upper bound on useful number of contexts

---

## Setup 3: "Decompose and Conquer" — Graph Workflow Test

### Purpose
Evaluate the decomposition/graph workflow. Answer Q4 (do users want to edit the graph?).

### Preparation
- Prepare a 1-2 page mathematical argument with clear sub-claims (a textbook proof that builds on lemmas)
- Have the app running with decomposition working

### Protocol
1. Load the source text. Walk the user through "Decompose Paper" to generate the graph.
2. Give them 1 minute to explore the graph silently. Note what they click.
3. Ask: "Does this decomposition match how you'd break down this argument?"
4. If they say no, ask: "What would you change? Would you merge nodes? Split them? Add dependencies? Remove them?"
5. Have them click a node and try "Formalise This Proposition."
6. After one node is formalized, ask:
   - "Would you formalize all nodes, or just certain ones?"
   - "If you were going to work through this proof, what order would you do the nodes?"
   - "Would you want to edit the graph structure, or is it good enough as a starting point?"
7. Show them "Formalize All" (if not already discovered). Observe their reaction.

### What This Tells You
- Whether the LLM's decomposition is useful or needs user correction
- Whether users want graph editing (informs #15 annotation layer — annotation could seed decomposition)
- Whether "Formalize All" is the primary workflow or whether per-node control matters
- Whether topological order matches user intuition

---

## Setup 4: "What Do You Do With This?" — Output Workflow Test

### Purpose
Understand what happens after formalization. Answer Q5 (what do users do with output?).

### Preparation
- Pre-generate a complete formalization: source text, semiformal proof, verified Lean code, and a decomposition graph with some verified nodes
- Have export functionality working

### Protocol
1. Show the user the completed workspace. "Imagine you just generated all of this. Now what?"
2. Observe what they do. Do they:
   - Try to copy text?
   - Look for an export button?
   - Try to share a link?
   - Start editing the semiformal text?
   - Go back to modify source/context?
3. Show them the export options (.md, .lean, .png, Export All zip). Ask:
   - "Which of these would you actually use?"
   - "Is there a format you wish was here?"
   - "Where would you put this? In a paper? A blog post? A Lean project? A slide deck?"
4. Ask: "If you could share this with someone right now, how would you want to do that?"
5. Hypothetical: "If this were a blog post draft instead of a zip file, would that change how useful it is?"

### What This Tells You
- Whether export-to-LessWrong (#14) is a real need or a nice-to-have
- Whether shareable links (#9 lite — maybe just a permalink without collaboration) matter
- Whether the output formats are right or if something is missing (LaTeX? PDF?)
- Whether users iterate after "completion" or treat it as done

---

## Setup 5: "The Blank Page" — Open-Ended Usage Test

### Purpose
Discover workflows you haven't imagined. No specific feature being tested.

### Preparation
- App running, empty workspace
- A brief description of the tool's purpose (1-2 sentences)
- User should be someone with a specific mathematical or alignment-research claim they want to formalize

### Protocol
1. Tell the user: "This tool helps you turn informal mathematical arguments into verified formal proofs. It can also decompose a paper into individual propositions and formalize them separately. Use it however you'd like on something you're actually working on."
2. Do not guide them. Sit back and observe for 15-20 minutes.
3. Note:
   - What's the first thing they do?
   - What do they paste/type as source? How much text?
   - Do they use context? What do they write?
   - Do they use decomposition or the single-proof flow?
   - Where do they get stuck?
   - What do they try to do that the tool doesn't support?
   - Do they talk to themselves? What do they say? (This reveals mental model.)
4. After they stop or finish, ask:
   - "What were you trying to accomplish?"
   - "Did the tool help? Where did it fall short?"
   - "What's the next step you'd take with what you got?"
   - "If you were going to use this regularly, what would need to change?"

### What This Tells You
- Real-world use cases you haven't anticipated
- Whether the tool's conceptual model matches user mental models
- Priority of all features — whatever they try to do that doesn't work is implicitly a feature request
- Whether the tool is useful for alignment research arguments (not just pure math)

---

## Setup 6: "The Walkthrough" — Onboarding Evaluation

### Purpose
Test whether guided onboarding (#10) is needed, and what form it should take. Also evaluates discoverability of features.

### Preparation
- App running, empty workspace
- A pre-written one-page "quick start guide" (printed or in a separate tab) — keep it to 5 bullet points max
- A simple mathematical claim for the user to work with

### Protocol
1. **Group A (no guide):** Give the user the claim and the app. "Turn this into a verified proof." Time how long it takes. Note where they get stuck.
2. **Group B (with guide):** Give the user the claim, the app, and the quick start guide. Same task. Time and observe.
3. After both complete (or give up), ask:
   - (Group A) "Was anything confusing about the interface?"
   - (Group B) "Did you read the guide? Which parts? Was it helpful or did you ignore it?"
   - (Both) "What would have helped you get started faster?"
4. Show both groups any features they didn't discover (decomposition, inline edit, context refinement). Ask: "Would you have used this if you'd known about it?"

### What This Tells You
- Whether discoverability is a real problem or if power users figure it out
- Whether a built-in tutorial is worth the effort vs. just a quick-start doc
- Which features are "hidden" — users don't find them without guidance
- Whether the panel-based navigation is intuitive

---

## Logistics Notes

### Recruiting Participants
- **Math-heavy users:** PhD students, postdocs, or researchers who write proofs
- **Alignment researchers:** People from AISC, MATS, or LessWrong who formalize arguments
- **Tool-savvy non-experts:** Software engineers familiar with LLMs but not formal verification
- Aim for 3-5 people per setup. Diminishing returns after 5 for qualitative research.

### Running Sessions
- 30-45 minutes per session
- Screen share or in-person (screen recording if they consent)
- Take timestamped notes, not just summaries
- Ask "what are you thinking?" when they pause for >10 seconds (think-aloud protocol)

### Synthesizing Results
After each round, write up:
1. **Patterns** — What did most users do the same?
2. **Surprises** — What did you not expect?
3. **Feature votes** — Tally which unbuilt features users implicitly or explicitly requested
4. **Priority update** — Revisit the feature brainstorm tiers in `feature-brainstorm.md`

Store synthesis notes in `docs/thoughts/user-research-findings.md` after conducting sessions.

---

## Open Questions to Leave in the Back of Your Mind

These are things to notice during research, not things to ask directly:

- Do users think in terms of "contexts" at all, or is that a researcher abstraction?
- Is the proof graph a natural representation, or do users think linearly?
- How much do users trust the AI output? Do they verify by reading, or just look at the green checkmark?
- Is "verified in Lean4" meaningful to the target audience, or is semiformal output sufficient?
- Would users return to this tool, or is it a one-shot novelty?
