# Users, Use Cases, and Development Directions — March 2026

These are the results of a divergent design exercise exploring who could use Metaformalism Copilot, what they'd use it for, what features would serve them, and how to evaluate whether the tool is actually useful. The goal is to map the landscape of possibilities, not to commit to a roadmap.

---

## Part 1: User Archetypes

### Group A: "Make my thinking more rigorous"

**A1. Indie researcher / rationalist blogger** — Has original insights, no institutional peer review process. Wants a "rigor partner" that challenges their reasoning. Writes essays with propositional claims that could be decomposed and stress-tested.

**A2. Formal-methods-adjacent researcher (AI safety, philosophy)** — Works at the boundary of informal intuition and formal proof. Already values formalization but finds the gap between insight and Lean code too wide to cross efficiently. Causal graphs and property tests map directly to their domain concerns.

**A3. PhD student** — Has a thesis argument their advisor keeps poking holes in. Needs to find the weak spots before the next meeting. Would use counterexamples and dialectical maps to pre-empt objections.

### Group B: "Break claims and find weaknesses"

**B1. Epistemic red teamer / auditor** — Systematically stress-tests an organization's stated assumptions, strategic plan, or published claims. Primarily wants counterexamples, property tests, and dialectical maps to surface vulnerabilities.

**B2. Legal scholar** — Decomposes judicial reasoning into propositions, then uses property tests and counterexamples to find edge cases where the logic breaks. Interested in whether a ruling's reasoning generalizes or is situation-specific.

**B3. Startup founder prepping for skeptics** — Pastes pitch deck claims ("our approach is 10x faster because..."), generates counterexamples and causal graphs to prepare for investor Q&A. Wants one-shot stress-testing more than iterative refinement.

### Group C: "Understand complex material through multiple lenses"

**C1. Policy analyst with data** — Has a dataset and a narrative about what it means. Wants to see if the causal claims in the narrative are supported by the data's structure. Uses causal graphs and statistical models side by side.

**C2. Investigative journalist** — Has source documents with causal claims. Needs to map what's actually established vs. assumed. Uses causal graphs to identify where the evidence chain has gaps.

**C3. Cross-disciplinary researcher** — Reading outside their field, wants structured decomposition to check their understanding. Multiple artifact types help them see which aspects they grasp and which they're papering over.

### Group D: "Translate between formality levels"

**D1. Science communicator / conference speaker** — Has rigorous material and needs audience-appropriate versions. Would use the tool's structured decomposition as an intermediate step, then recompose for a specific audience format (TED talk, executive summary, classroom explanation).

**D2. Math/logic educator** — Takes students' informal proof attempts, formalizes them to show where the logical gaps are. The semiformal proof + Lean pipeline is a teaching tool: "here's what your argument actually says, and here's where it breaks."

**D3. Technical writer** — Translates between expert and non-expert representations of the same system. Multiple artifact types give them different angles on the same concept to draw from.

### Group E: "Apply structural templates"

**E1. Narrative analyst / writer** — Maps stories, pitches, or arguments onto known structural frameworks: Campbell's monomyth, Snyder's Save the Cat beats, Propp's morphology. The same source material looks different through each template.

**E2. Strategist** — Maps business situations onto strategic frameworks: Porter's Five Forces, Wardley Maps, OODA loops, Jobs to Be Done. Wants to see which framework reveals something the others miss.

**E3. Argument mapper** — Maps any discourse onto argumentation frameworks: Toulmin's model (claim, grounds, warrant, backing, qualifier, rebuttal), pragma-dialectics, informal logic taxonomies.

### Group F: "Formalize from non-text sources"

**F1. Data scientist** — Feeds in datasets alongside interpretive hypotheses. Wants statistical models and causal graphs grounded in actual column names, distributions, and relationships — not just prose descriptions.

**F2. Developer seeking correctness** — Feeds in code plus a description of intended behavior. Wants property tests that reference real types and interfaces, and Lean contracts grounded in actual function signatures.

**F3. Conversation analyst** — Feeds in meeting transcripts or debate recordings. Needs to extract propositional structure from dialogue — who claimed what, what was conceded, where the actual disagreements are.

---

## Part 2: Feature Map

Each feature tagged with which user groups it primarily serves.

### Existing features

| # | Feature | Groups served |
|---|---------|---------------|
| F1 | Text input + proposition decomposition | A, B, C |
| F2 | Semiformal proof + Lean verification | A |
| F3 | Causal graph generation | A, B, C |
| F4 | Statistical model generation | C, F |
| F5 | Property tests generation | A, B, F |
| F6 | Dialectical map | A, B, C |
| F7 | Counterexamples | B |
| F8 | Iterative refinement / bidirectional editing | A, D |

### The reframing: artifact types as hardcoded frameworks

A key insight from this design exercise: **every existing artifact type is already a template-matching formalism with a hardcoded template.** The causal graph's template is "variables + directed edges + confounders + summary." The statistical model's template is "variables with roles + hypotheses + assumptions." The dialectical map's template is "perspectives + tensions + synthesis." Each one takes source text and maps it onto a pre-defined structure.

The dialectical map makes this especially visible. It does three things: (1) *discover* perspectives within the text, (2) *map* them onto a structure, (3) *synthesize* across them. That's exactly what a general template-matching formalism would do — the only difference is that the dialectical map's template is baked into the code rather than specified by the user.

This means the question isn't "should we add template-matching as a new feature?" but rather **"should we make the existing artifact type system extensible so users can define, combine, and discover their own templates?"**

We think of this as a **Framework Arts and Crafts Fair** rather than a framework library. A library implies picking a canonical framework off a shelf. An arts and crafts fair says: here are materials and tools — pick things up, mash them together, or build something new. This maps to four distinct operations:

| Operation | Description | Example | Currently possible? |
|-----------|-------------|---------|-------------------|
| **Pick up** | Apply an existing framework to source material | "Show me this through Toulmin's model" | Yes, for the 6 hardcoded artifact types. Not for user-selected frameworks. |
| **Mash together** | Combine elements from multiple frameworks into a hybrid | "I want Toulmin's warrant/backing distinction but with causal graph edges connecting the claims" | No |
| **Build on the fly** | Specify a novel template in natural language | "Map this onto: core claim, three strongest supporting observations, the assumption each depends on, and the cheapest experiment that could falsify each" | No |
| **Found art** | Let the tool discover what structural frameworks the text naturally fits | "I don't know what structure is in here — show me what you find" | Partially — the dialectical map does this for one specific template (perspectives/tensions/synthesis) |

Under this framing, the existing artifact types become **pre-built framework specs** — the causal graph spec is `{variables: [], edges: [], confounders: [], summary: ""}`, the dialectical map spec is `{perspectives: [], tensions: [], synthesis: {}}`. User-defined frameworks would use the same underlying machinery.

This also clarifies the relationship between the dialectical map and cross-artifact comparison. The dialectical map's structure (perspectives, tensions, synthesis) is exactly the right shape for **comparing other artifacts against each other** — not just finding perspectives within source text, but finding tensions between what the causal graph claims and what the statistical model supports. The dialectical map could evolve into a meta-artifact: the synthesis layer that operates *on other artifacts* rather than only on source text.

### Proposed features: Input expansion

| # | Feature | Groups served | Description |
|---|---------|---------------|-------------|
| F9 | Transcript / audio ingestion | C, E, F | Accept audio/video files or live transcription output. Convert dialogue to text, then run existing decomposition. Straightforward extension — the hard work is in the pipeline that already exists. |
| F10 | CSV / spreadsheet ingestion | C, F | Parse tabular data to extract variables, distributions, and relationships. The statistical model and causal graph artifacts already have the right output structure — this grounds them in actual data rather than prose descriptions of data. |
| F11 | Code ingestion | F | Parse functions, types, and interfaces from source code. Property tests and Lean contracts can then reference real signatures instead of describing behavior abstractly. |

### Proposed features: Extensible framework system (the "Arts and Crafts Fair")

This replaces the earlier separate proposals for "template-matching formalisms" (F12), "framework library" (F18), and "comparative lens view" (F14). Those were treating symptoms of a deeper architectural opportunity: making the framework/template system itself a first-class, user-facing capability.

| # | Feature | Groups served | Description |
|---|---------|---------------|-------------|
| F12 | Framework specification language | All | A way to describe "a framework is a set of named structural slots with relationships between them." Existing artifact types become pre-built specs in this language. Users can write new specs in natural language or structured format. This is the foundational infrastructure — everything else in this section depends on it. |
| F12a | Pick up: user-selected framework application | E, C | Apply a framework from a catalog to source material. "Map this onto Campbell's monomyth." The catalog starts with the existing hardcoded artifact types plus 5-10 well-known frameworks (Toulmin, Campbell, Porter, Lakatos, etc.) and grows over time. Replaces the old F18 (framework library). |
| F12b | Mash together: framework composition | A, C, E | Combine structural elements from multiple frameworks into a hybrid. "I want Toulmin's warrant/backing distinction but with causal graph edges connecting the claims." Requires the framework spec language (F12) to support referencing slots across specs. |
| F12c | Build on the fly: natural-language framework definition | All | The user describes a novel template in natural language and the tool generates a framework spec, then fills it from the source material. "Map this onto: core claim, three strongest supporting observations, the assumption each depends on, and the cheapest experiment that could falsify each." The framework spec is saveable and reusable. |
| F12d | Found art: framework discovery from text | A, B, C | The tool proposes what structural frameworks the source text naturally fits, *before* the user selects one. A generalization of what the dialectical map currently does for perspectives — but for arbitrary structural patterns. "This text has a nested argument structure with three levels of supporting evidence" or "this reads like a causal narrative with two competing mechanisms." |
| F14 | Cross-framework synthesis view | A, C, E | Side-by-side display of the same source through 2-3 frameworks, **plus a synthesis layer** that identifies where frameworks agree, disagree, and what each reveals that the others don't. The synthesis layer uses the dialectical map's structure (perspectives/tensions/synthesis) as a meta-framework operating on other frameworks' outputs rather than on source text directly. Replaces the earlier "comparative lens view" proposal which was display-only. |
| F13 | Audience-targeted recomposition | D | Inverts the tool's current direction. Takes a structured decomposition (any framework's output) and repackages it for a specific audience or format: TED talk structure, executive summary, classroom explanation, blog post. Formal → accessible instead of informal → formal. Note: audience formats (TED talk, executive summary) are themselves frameworks — recomposition could be implemented as "apply the TED-talk framework to the output of the causal-graph framework." |

### Proposed features: Literature search and knowledge grounding

These capabilities were originally proposed in [feature-proposals-2026-02.md](feature-proposals-2026-02.md) §5 and are integrated here with their archetype mappings. They form a progression from concrete (Mathlib lookup) to ambient (living bibliography), and collectively serve as a **synthetic peer group** — filling the role that colleagues, advisors, and reviewers play for institutionally-connected researchers.

| # | Feature | Groups served | Description |
|---|---------|---------------|-------------|
| F19 | Mathlib / Lean ecosystem search | A (esp. A2) | Search Mathlib for existing definitions, lemmas, and theorems that can be imported rather than re-derived. Triggered after Lean generation or verification failure. Pairs with Lean error explanation. Narrow but deep: a power feature for the core Lean pipeline user. |
| F20 | Academic paper search | A, C (esp. A2, A3, C3) | Given source text and context, find related papers — particularly those that formalize similar concepts. Uses Semantic Scholar or similar APIs. Helps the "lone thinker" archetypes (indie researcher, PhD student, cross-disciplinary reader) discover that their insight already has a name, a history, or an alternative formalization. |
| F21 | Context enrichment via literature | A, C (esp. A1, C3) | During context-writing, suggest relevant definitions, terminology, and references. "You're describing something that looks like a monad — here's the standard definition." Intervenes *before* formalization to improve the context that drives all downstream artifacts. |
| F22 | Alternative formalization discovery | A, C, E | After producing a formalization, surface how the same concept has been formalized differently elsewhere. "Your insight was formalized using category theory, but there's also an order-theoretic approach in [paper X]." The most philosophically aligned sub-capability — it directly operationalizes "generalization via inclusion" through external knowledge. Under the arts-and-crafts-fair reframing, F22 becomes the **external supply chain** for the fair: "here's a framework fragment that other people found useful for material like yours — want to pick it up, or mash it into what you're building?" It can suggest frameworks from the built-in catalog (F12a), from academic literature (F20), or from domain-specific pattern libraries. |
| F23 | Living bibliography | A (esp. A2, A3), D | As the user works through formalization, the tool maintains a running bibliography of relevant references that accumulate across the session. Exportable alongside artifacts. Serves the "last mile" for users producing academic output (PhD thesis, papers) or presentations. |

**Generalized form for non-academic archetypes:** Literature search as conceived above targets academic literature and the Lean ecosystem. Groups E and F are largely unserved by this. However, the underlying capability of F22 — "suggest alternative structural interpretations" — generalizes beyond papers: for a narrative analyst, it's "you used Campbell, but Propp highlights different features"; for a data scientist, it's "you modeled this as linear, but here's a paper suggesting threshold effects in similar data." A generalized version of F22 would search framework catalogs, methodological papers, and domain-specific pattern libraries, not just academic literature.

### Proposed features: Enhanced output and validation

Note: F14 (comparative lens / cross-framework synthesis) and F18 (framework library) have been absorbed into the extensible framework system above. F14 is now the cross-framework synthesis view with a dialectical-map-based synthesis layer. F18 is now F12a's framework catalog.

| # | Feature | Groups served | Description |
|---|---------|---------------|-------------|
| F15 | Data-grounded statistical validation | F | Given actual data (from F10), check whether a generated statistical model's assumptions hold. Run basic distribution tests, correlation checks, and flag where the model's assumptions diverge from the data's reality. |
| F16 | Argument strength scoring | B | Extend counterexamples with quantified robustness metrics. After generating counterexamples, rate which sub-claims are weakest and where the overall argument is most vulnerable. Partially exists via the `robustnessAssessment` field. |
| F17 | Export to domain-specific formats | D, F | Beyond current export: Lean project files, R/Python scripts from statistical models, Mermaid/DOT from graphs, slide deck outlines from recompositions. Makes output actionable outside the tool. |

---

## Part 3: Fitness Analysis

### What makes a user/use-case a good fit?

| # | Constraint | Hard/Soft | Notes |
|---|-----------|-----------|-------|
| A | **User has ingestible source material** | Hard | Currently text-only. Expanding to transcripts, data, and code (F9-F11) widens this. |
| B | **Source material contains mappable structure** — content that can be decomposed into structural elements | Hard | Originally stated as "propositional content" (truth-apt claims). The arts-and-crafts-fair reframing relaxes this: if the framework system is extensible, any source with *structure* — narrative, strategic, argumentative, causal — is ingestible. The constraint becomes "source material is not purely aesthetic or purely emotive." |
| C | **User can evaluate the output** — enough domain expertise to judge whether the formalization is right, not just plausible | Soft | The tool's philosophy of active participation requires this. Users who can't critique output get less value and risk false confidence. |
| D | **Iterative refinement is valuable** — the user benefits from shaping the formalism, not just receiving it one-shot | Soft | This is a key differentiator vs. a plain LLM prompt. Users who want one-shot (B3) can still use the tool but aren't its sweet spot. |
| E | **Multiple formal lenses matter** — the same source genuinely benefits from causal, deductive, dialectical, etc. views | Soft | This is the "generalization via inclusion" thesis. If only one artifact type is useful for a given user, the tool is a fine single-artifact generator but the philosophical thesis isn't validated. |
| F | **The source material is pre-rigorous or post-rigorous** — informal insights that *could* be formalized but haven't been yet | Hard | If the source is already formal, there's less to do. Audience-targeted recomposition (F13) creates value on the *other* end — already-formal material made accessible. |

### Archetype fitness matrix

| Archetype | A: Ingestible | B: Propositional | C: Can evaluate | D: Iterative | E: Multi-lens | F: Pre/post-rigorous | Lit search boost | Overall |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---------|
| A1. Indie researcher | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | High (F21, F22) — synthetic peer group | **Strong** |
| A2. Formal-methods researcher | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | High (F19, F20, F22) — Mathlib + papers | **Strong** |
| A3. PhD student | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | High (F20, F23) — papers + bibliography | **Strong** |
| B1. Red teamer / auditor | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Low — stress-testing, not literature | **Strong** |
| B2. Legal scholar | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Moderate (F20§) — case law as "literature" | **Strong** |
| B3. Startup founder | ✓ | ✓ | ~ | ✗ | ~ | ✓ | Low | Moderate |
| C1. Policy analyst with data | ~* | ✓ | ~ | ✓ | ✓ | ✓ | Moderate (F20) | Good (needs F10) |
| C2. Investigative journalist | ✓ | ~ | ~ | ✓ | ~ | ✓ | Low | Moderate |
| C3. Cross-disciplinary researcher | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | High (F20, F21) — key for outsiders | Good → **Strong** with lit search |
| D1. Science communicator | ✓ | ✓ | ✓ | ~ | ~ | ✗† | Moderate (F23) — bibliography for output | Moderate (needs F13) |
| D2. Math educator | ✓ | ✓ | ✓ | ~ | ✗ | ~ | Moderate (F19) — Mathlib for teaching | Moderate |
| D3. Technical writer | ✓ | ✓ | ✓ | ~ | ~ | ~ | Low | Moderate (needs F13) |
| E1. Narrative analyst | ✓ | ✓‡ | ✓ | ✓ | ✓ | ✓ | Low‖ | Good → **Strong** (with F12) |
| E2. Strategist | ✓ | ✓‡ | ✓ | ✓ | ✓ | ✓ | Low‖ | Good → **Strong** (with F12) |
| E3. Argument mapper | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Moderate (F22‖) | **Strong** (with F12) |
| F1. Data scientist | ✗* | ✓ | ✓ | ✓ | ✓ | ✓ | Moderate (F20) — methodological papers | Good (needs F10) |
| F2. Developer | ✗* | ✓ | ✓ | ✓ | ~ | ✓ | Low | Good (needs F11) |
| F3. Conversation analyst | ~* | ~ | ✓ | ✓ | ✓ | ✓ | Low | Good (needs F9) |

\* Needs input expansion (F9/F10/F11) to work well.
† Source is already rigorous; needs F13 (recomposition) to be useful.
‡ Under the relaxed constraint B ("mappable structure" rather than "propositional content"), narrative and strategic material qualifies. These archetypes need the extensible framework system (F12) to define appropriate structural templates.
§ F20 would need to extend beyond academic papers to case law databases to fully serve this archetype.
‖ Groups E archetypes are unserved by literature search *as currently scoped* (academic literature). A generalized F22 that searches framework catalogs and structural pattern libraries would change this from Low to High.

---

## Part 4: Evaluation Methods

### Intrinsic quality — does the tool produce good output?

| Metric | What it measures | How to evaluate | Relevant groups |
|--------|-----------------|----------------|----------------|
| Proposition extraction accuracy | Are the decomposed propositions faithful to the source? | Human rating against source text; inter-rater agreement | A, B, C |
| Artifact internal consistency | Does the generated artifact make logical sense on its own? | Domain expert review; automated checks (e.g., graph has no orphan nodes, statistical model has testable hypotheses) | All |
| Lean verification pass rate | Does generated Lean code actually type-check? | Automated — already built | A |
| Literature relevance precision | Are suggested papers/lemmas actually relevant to the user's formalization? | Human rating: "was this suggestion useful?" on a per-suggestion basis | A, C |
| Context enrichment quality | Do literature-based context suggestions improve downstream artifact quality? | Compare artifacts generated with vs. without F21 context enrichment on the same source text | A, C |
| Counterexample quality | Are counterexamples genuinely challenging, not strawmen? | Human rating: "did this make me update my belief about the claim?" | B |
| Framework application fidelity | Does the structural mapping follow the framework correctly — for both built-in and user-defined frameworks? | For built-in: expert review against framework definition. For user-defined (F12c): does the output match what the user described? Post-generation rating: "is this what I meant?" | E, All |
| Framework composition coherence | When users mash together elements from multiple frameworks (F12b), is the result structurally coherent or a jumble? | Expert review of hybrid outputs; user satisfaction rating | A, C, E |
| Framework discovery usefulness | When the tool proposes frameworks via found-art (F12d), are the suggestions genuinely illuminating? | Human rating: "did the suggested framework reveal structure I didn't see?" Compare to user's own framework choice. | A, B, C |
| Recomposition accuracy | Does the audience-targeted version preserve the essential content? | Compare expert's reading of the original vs. the recomposition: are the same key claims present? | D |

### Workflow impact — does using the tool change how people work?

| Metric | What it measures | How to evaluate | Relevant groups |
|--------|-----------------|----------------|----------------|
| Revision rate after formalization | Do users change their original text after seeing the formalization? | Track edits to source material after artifact generation | A, D |
| Argument improvement | Is the final version of a claim stronger/clearer than the first? | Before/after comparison by independent raters | A, B |
| Time to identify weaknesses | How quickly can a user find the main vulnerabilities in an argument? | Timed task: "find the three biggest problems with this argument" with and without tool | B |
| Cross-lens insight discovery | Do users notice something from a second/third artifact type that they missed in the first? | Post-task survey: "what did you learn from the [causal graph] that you didn't see in the [dialectical map]?" | A, C, E |
| Alternative formalization uptake | When F22 suggests an alternative formalization approach, do users try it? Does it produce a different-but-valuable result? | Track click-through on suggestions + user rating of the alternative artifact | A, C, E |
| Appropriate trust calibration | After using the tool, do users have *accurately calibrated* confidence in their claims? | Compare user confidence ratings to independent expert assessment. The goal isn't more or less confidence — it's *correct* confidence. | A, B |

### Adoption signals — do people actually want to use it?

| Signal | What it tells you | How to measure |
|--------|------------------|---------------|
| Session depth | Do users go beyond one-shot generation? Do they iterate? | Count refinement cycles per session |
| Artifact type breadth | Do users try multiple artifact types for the same source? | Track distinct artifact types generated per source text |
| Return usage | Do users come back? | Repeat sessions per user over time |
| Source material classification | What are people actually feeding in? | Classify input texts by type — this reveals which archetypes are real vs. hypothetical |
| Feature request patterns | What do users ask for that doesn't exist? | Qualitative analysis of feedback channels |
| Drop-off points | Where do users stop? After first generation? After seeing output? After trying to edit? | Funnel analysis of the pipeline steps |

### Core thesis validation — does "generalization via inclusion" actually work?

This is the deepest evaluation question: **does producing multiple formalisms of the same insight generate understanding that a single formalism doesn't?**

Possible study designs:

1. **Comparative artifact study** — Give two groups the same source material. Group A gets one artifact type. Group B gets three. Test whether Group B performs better on tasks requiring deep understanding: transfer to new domains, identifying hidden assumptions, generating novel extensions of the idea.

2. **Disagreement resolution** — When two artifact types *disagree* about the same source (e.g., the causal graph suggests X is a confounder but the dialectical map treats it as a core claim), track whether resolving the disagreement produces genuine insight that neither artifact alone provided.

3. **Framework plurality test** — Give users the same material mapped onto 2-3 different frameworks (both built-in artifact types and user-defined ones). Can they articulate what each framework reveals that the others don't? Do they develop a richer understanding than users who saw only one mapping? Under the arts-and-crafts-fair framing, also test: do users who *build their own* framework develop deeper understanding than users who apply a pre-built one?

4. **Calibration improvement** — Measure users' epistemic calibration (confidence vs. accuracy) before and after using the tool on their own claims. The tool should make people *more accurate* about which of their beliefs are well-supported, not uniformly more or less confident.

5. **Arts-and-crafts engagement** — Which of the four operations (pick up, mash together, build on the fly, found art) do users gravitate toward? Do users who start with "pick up" graduate to "build on the fly," or do most users stay with pre-built frameworks? This reveals whether the extensible framework system is a power-user feature or a core part of the experience.

---

## Part 5: Development Priority Clusters

### High impact, moderate effort — expand the input surface

- **F9 (transcripts)** — Technically straightforward (transcription APIs exist). Opens conversation analyst archetype and makes the tool usable for meeting/debate/interview material.
- **F10 (spreadsheets)** — Makes statistical model and causal graph dramatically more useful by grounding them in real data. Opens data scientist and policy analyst archetypes.

### High impact, significant effort — the extensible framework system ("Arts and Crafts Fair")

This is the most architecturally significant direction. It reframes the entire artifact type system from "N hardcoded output formats" to "an extensible framework engine with user-facing composition tools." The recommended build sequence:

1. **F12 (framework specification language)** — The foundation. Define what a framework spec looks like. Migrate existing artifact types to be specs in this language. Until this exists, everything else is ad hoc. This is significant effort because it touches the core artifact generation pipeline, API routes, and panel rendering.

2. **F12a (pick up)** — Lowest-risk first application. Users select from a catalog of pre-built frameworks (starting with the existing artifact types plus 5-10 well-known ones). Validates that the spec language works and that users want frameworks beyond the built-in set.

3. **F12c (build on the fly)** — The arts-and-crafts payoff. Users describe a framework in natural language, the tool generates a spec and fills it. This is where the tool becomes genuinely novel — no existing tool lets you say "map this onto [bespoke structure]" and get a result. High LLM dependence: the quality of natural-language-to-spec conversion is critical.

4. **F12d (found art / framework discovery)** — Generalizes what the dialectical map currently does. The tool proposes frameworks the text naturally fits, *before* the user selects one. Requires the spec language to be expressive enough that discovered frameworks are reusable, not one-off descriptions.

5. **F12b (mash together)** — The most ambitious operation. Combining structural elements across frameworks requires the spec language to support cross-references and composition. Build last because it needs the most mature spec language and the user needs experience with individual frameworks first.

6. **F14 (cross-framework synthesis view)** — The UI payoff. Side-by-side display with a dialectical-map-style synthesis layer. Depends on having multiple framework outputs to compare. The synthesis layer is the evolved role of the dialectical map: it becomes the meta-framework that operates on other frameworks' outputs.

**Where F13 (audience recomposition) fits:** Under this framing, audience formats (TED talk, executive summary, blog post) are themselves frameworks. Recomposition becomes "apply the TED-talk framework to the output of the causal-graph framework" — framework-to-framework transformation rather than a separate feature. This means F13 comes naturally once F12a exists, as long as the catalog includes audience-oriented frameworks alongside analytical ones.

### High impact, moderate effort — knowledge grounding (literature search)

Literature search capabilities (F19-F23) enhance the existing workflow and serve as the **external supply chain** for the arts and crafts fair — surfacing framework fragments and formalizations from the wider world that users can pick up or incorporate. See [feature-proposals-2026-02.md §5](feature-proposals-2026-02.md) for the full design space exploration.

- **F19 (Mathlib search)** — Most concrete and immediately useful for the Lean pipeline. External APIs exist (Moogle, LeanSearch). Narrow audience (A2, D2) but high value for them.
- **F20 (paper search)** — Broadest reach among the literature features. Serves the "lone thinker" archetypes who lack a peer group. Semantic Scholar API is free. The key differentiator vs. just searching Semantic Scholar directly is *integration* — results appear at the moment they're relevant, not in a separate tab.
- **F21 (context enrichment)** — Intervenes before formalization, improving everything downstream. Highest leverage per unit of effort, but hardest to get right — suggestions need to be genuinely helpful, not noisy. Start with explicit "suggest terminology" action, not ambient suggestions.
- **F22 (alternative formalizations)** — The philosophical keystone. Under the arts-and-crafts-fair framing, this becomes the external supply chain: "here's a framework fragment that other people found useful for material like yours — want to pick it up, or mash it into what you're building?" Connects to F12a (suggesting frameworks from the catalog), F20 (suggesting frameworks from papers), and domain-specific pattern libraries. Highest potential impact but requires deep semantic understanding.
- **F23 (living bibliography)** — Lowest standalone impact but accumulates value over a session. Natural complement to F17 (export) — export your artifacts *and* their bibliography. Serves the PhD student and science communicator archetypes.

Recommended sequence: F19 → F20 → F21 → F23 → F22. Each builds on the search infrastructure of the previous one. F22 is last because it's most ambitious and benefits from all the others being in place. F22 also benefits enormously from the framework system (F12) being in place — it can suggest frameworks as importable specs rather than just paper references.

### Lower effort, sharpens existing value

- **F16 (argument strength scoring)** — Extends the existing counterexamples artifact. Serves the red-teamer archetype with quantified output.
- **F17 (domain-specific export)** — Makes output actionable outside the tool. Lean project files, R scripts, graph formats. Pairs with F23 (living bibliography) for academic users. Under the framework system, export format could itself be a framework spec.

---

## Open Questions

1. **Which archetypes should we validate first?** The strong-fit archetypes (A1, A2, B1, B2) could use the tool today. Should we find 2-3 real users matching these profiles and learn from their experience before building for the moderate-fit groups?

2. **What does the framework specification language look like?** This is the most consequential design decision in the proposal. Options range from a structured JSON schema (explicit, machine-friendly, harder for users to write) to natural language descriptions that the LLM interprets (easy for users, harder to guarantee consistency). A middle ground might be a lightweight DSL: "slots: [claim, evidence, warrant, backing] / relations: [evidence supports claim, warrant connects evidence→claim]". The existing artifact type response schemas (e.g., `{perspectives: [], tensions: [], synthesis: {}}`) are a starting point — can they be generalized?

3. **How does "build on the fly" (F12c) interact with output rendering?** The existing artifact types each have a dedicated panel and rendering logic. A user-defined framework produces a novel structure — what does the UI do with it? Options: (a) generic key-value / tree renderer, (b) LLM-generated rendering hints in the framework spec, (c) a small set of rendering primitives (list, graph, table, narrative) that the spec maps onto. This determines whether user-defined frameworks *feel* as good as built-in ones or like second-class citizens.

4. **Should the dialectical map keep its own panel, or become the synthesis layer?** Under the reframing, the dialectical map could evolve into the meta-framework for F14 (cross-framework synthesis). But it's also a useful standalone artifact type. It could be both: standalone when applied to source text, synthesis-mode when applied to other artifacts. Is that confusing or natural?

5. **How important is the recomposition direction (F13)?** If audience formats are just frameworks in the catalog, F13 is "free" once F12a exists. But framework-to-framework transformation (causal graph → TED talk) is a harder generation task than text-to-framework. Does the LLM handle this well, or does it need a different prompt strategy?

6. **What's the minimum viable evaluation?** A full comparative study is expensive. Could we start with something lighter — e.g., a structured self-report from 5 users: "paste something you wrote, use 3 artifact types, tell us what you learned"? For the framework system specifically: have 3 users try "build on the fly" and see if the results are coherent.

7. **Should non-text input (F10, F11) change the decomposition step?** Currently decomposition extracts propositions from text. For data, you'd extract relationships and patterns. For code, you'd extract contracts and invariants. Under the framework reframing, these might be different *framework specs* applied to different input types rather than different decomposition pipelines.

8. **How should literature search generalize beyond academic papers?** F19-F23 are scoped to academic literature and the Lean ecosystem, which leaves Groups E and F underserved. Under the arts-and-crafts-fair framing, F22 becomes the external supply chain — but the "supply" for a narrative analyst is framework catalogs and structural pattern libraries, not papers. Should F22 search different backends depending on the active framework type?

9. **Where does literature search live in the UI?** Three options with different tradeoffs: (a) a dedicated Literature panel — visible but adds navigation weight; (b) integrated into existing panels (Mathlib hints in the Lean panel, paper suggestions in the context panel) — seamless but scattered; (c) a persistent sidebar element that accumulates references across panels — ambient but potentially noisy. The answer may differ by sub-capability (F19 fits naturally in the Lean panel; F23 wants its own space).

10. **Is "Framework Arts and Crafts Fair" the right metaphor for users?** The metaphor works well internally for design decisions, but would users understand what "build a framework on the fly" means? The tool might need to present this as something more concrete: "describe what structure you're looking for" or "tell me what aspects of this text matter to you." The underlying capability is the same, but the framing affects adoption.
