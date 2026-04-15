/**
 * API route for generating evidence-based artifact edit proposals.
 *
 * Takes an artifact (statistical-model or counterexamples) and scored papers,
 * returns surgical edit proposals that the user can approve or reject.
 * This is Phase 4 of the evidence grounding architecture.
 */

import { NextRequest, NextResponse } from "next/server";
import { callLlm, OpenRouterError } from "@/app/lib/llm/callLlm";
import { CLAUDE_SONNET } from "@/app/lib/llm/models";
import { stripCodeFences } from "@/app/lib/utils/stripCodeFences";
import {
  MAX_INTEGRATION_PAPERS,
  type EvidenceArtifactType,
  type EvidenceIntegrateRequest,
  type EvidenceIntegrateResponse,
  type RawIntegrationProposal,
} from "@/app/lib/types/evidence";
import { validateProposal } from "./integrateValidation";
const MAX_ARTIFACT_LENGTH = 10000;

// ---------------------------------------------------------------------------
// Artifact schema descriptions (so the LLM knows valid fieldPaths)
// ---------------------------------------------------------------------------

const SCHEMA_DESCRIPTIONS: Record<EvidenceArtifactType, string> = {
  "statistical-model": `The artifact is a statistical model with this structure:
{
  "summary": "string",
  "variables": [{ "id": "string", "label": "string", "role": "independent|dependent|confounding|control", "distribution": "string (optional)" }],
  "hypotheses": [{ "id": "string", "statement": "string", "nullHypothesis": "string", "testSuggestion": "string" }],
  "assumptions": ["string", ...],
  "sampleRequirements": "string (optional)"
}

Valid fieldPaths include:
- "summary" — the overall model summary
- "variables[i].distribution" — a variable's assumed distribution
- "hypotheses[i].statement" — a hypothesis statement
- "hypotheses[i].nullHypothesis" — a null hypothesis
- "hypotheses[i].testSuggestion" — the suggested statistical test
- "assumptions[i]" — an individual assumption
- "sampleRequirements" — sample size/requirements description`,

  counterexamples: `The artifact is a counterexamples analysis with this structure:
{
  "claim": "string",
  "counterexamples": [{ "id": "string", "scenario": "string", "targetAssumption": "string", "explanation": "string", "plausibility": "high|medium|low" }],
  "robustnessAssessment": "string",
  "summary": "string"
}

Valid fieldPaths include:
- "claim" — the claim being tested
- "counterexamples[i].scenario" — a counterexample scenario
- "counterexamples[i].explanation" — why the counterexample works
- "counterexamples[i].plausibility" — plausibility rating (high/medium/low)
- "robustnessAssessment" — overall robustness assessment
- "summary" — the analysis summary`,
};

// ---------------------------------------------------------------------------
// LLM prompt
// ---------------------------------------------------------------------------

const INTEGRATE_SYSTEM_PROMPT = `You propose specific, surgical edits to a structured artifact based on evidence from academic papers.

Your task:
1. Read the artifact content carefully
2. Read the evidence papers (titles, abstracts, scores)
3. Identify 2-5 specific fields in the artifact that should be updated based on the evidence
4. For each, propose a concrete replacement value

Rules:
- Each proposal must target ONE specific field via its fieldPath
- The currentValue MUST exactly match what is currently in the artifact at that fieldPath
- The proposedValue should be a concrete replacement, not a suggestion to "consider" something
- Keep proposed changes proportional — update the specific text, don't rewrite entire sections
- Reference specific findings from the papers (effect sizes, sample sizes, conclusions)
- Prioritize high-reliability and high-relatedness papers
- If a paper contradicts a claim, use editType "flag-contradiction"
- If a paper provides specific numbers to update, use editType "update-prior"
- If a paper supports/strengthens a claim, use editType "add-evidence"
- For general improvements in precision, use editType "refine-wording"

Return a JSON object with this exact shape:
{
  "proposals": [
    {
      "fieldPath": "hypotheses[0].statement",
      "fieldLabel": "Hypothesis H1",
      "currentValue": "X causes Y",
      "proposedValue": "X causes Y with moderate effect (d=0.4, based on Smith et al. 2023 meta-analysis)",
      "rationale": "Smith et al. (2023) meta-analysis of 12 RCTs found a consistent moderate effect (d=0.4, 95% CI [0.2, 0.6]).",
      "paperIds": ["W12345"],
      "editType": "update-prior"
    }
  ]
}`;

const INTEGRATE_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "integration_proposals",
    strict: true,
    schema: {
      type: "object",
      required: ["proposals"],
      additionalProperties: false,
      properties: {
        proposals: {
          type: "array",
          items: {
            type: "object",
            required: [
              "fieldPath",
              "fieldLabel",
              "currentValue",
              "proposedValue",
              "rationale",
              "paperIds",
              "editType",
            ],
            additionalProperties: false,
            properties: {
              fieldPath: { type: "string" },
              fieldLabel: { type: "string" },
              currentValue: { type: "string" },
              proposedValue: { type: "string" },
              rationale: { type: "string" },
              paperIds: { type: "array", items: { type: "string" } },
              editType: {
                type: "string",
                enum: ["update-prior", "add-evidence", "flag-contradiction", "refine-wording"],
              },
            },
          },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<EvidenceIntegrateRequest>;

    // Validate request
    if (!body.artifactType || !(body.artifactType in SCHEMA_DESCRIPTIONS)) {
      return NextResponse.json({ error: "artifactType must be 'statistical-model' or 'counterexamples'" }, { status: 400 });
    }
    if (!body.artifactContent || typeof body.artifactContent !== "string") {
      return NextResponse.json({ error: "artifactContent is required" }, { status: 400 });
    }
    if (!Array.isArray(body.papers) || body.papers.length === 0) {
      return NextResponse.json({ error: "papers array is required and must not be empty" }, { status: 400 });
    }
    if (body.papers.length > MAX_INTEGRATION_PAPERS) {
      return NextResponse.json({ error: `Too many papers (max ${MAX_INTEGRATION_PAPERS})` }, { status: 400 });
    }

    // Parse and validate artifact content
    let artifact: Record<string, unknown>;
    try {
      artifact = JSON.parse(body.artifactContent.slice(0, MAX_ARTIFACT_LENGTH));
    } catch {
      return NextResponse.json({ error: "artifactContent is not valid JSON" }, { status: 400 });
    }

    const validPaperIds = new Set(body.papers.map((p) => p.openAlexId));

    // Build user message
    const paperSummaries = body.papers.map((p, i) => {
      const parts = [`Paper ${i + 1} (ID: ${p.openAlexId}):`];
      parts.push(`  Title: ${p.title}`);
      if (p.year) parts.push(`  Year: ${p.year}`);
      if (p.reliability) {
        parts.push(`  Study type: ${p.reliability.studyType}`);
        parts.push(`  Reliability score: ${p.reliability.score.toFixed(2)}`);
      }
      if (p.relatedness) {
        parts.push(`  Relatedness score: ${p.relatedness.score.toFixed(2)}`);
      }
      if (p.abstract) parts.push(`  Abstract: ${String(p.abstract).slice(0, 500)}`);
      else parts.push("  Abstract: (not available)");
      return parts.join("\n");
    });

    const userMessage = `${SCHEMA_DESCRIPTIONS[body.artifactType]}

Current artifact content:
${body.artifactContent.slice(0, MAX_ARTIFACT_LENGTH)}

Evidence papers:
${paperSummaries.join("\n\n")}

Propose 2-5 specific edits to the artifact based on these papers.`;

    const { text } = await callLlm({
      endpoint: "evidence-integrate",
      systemPrompt: INTEGRATE_SYSTEM_PROMPT,
      userContent: userMessage,
      maxTokens: 4096,
      openRouterModel: CLAUDE_SONNET,
      responseFormat: INTEGRATE_SCHEMA,
    });

    if (!text) {
      // No API key — return empty proposals
      return NextResponse.json({ proposals: [] } satisfies EvidenceIntegrateResponse);
    }

    // Parse and validate LLM response
    const parsed = JSON.parse(stripCodeFences(text));
    if (!Array.isArray(parsed.proposals)) {
      return NextResponse.json({ error: "Invalid LLM response format" }, { status: 502 });
    }

    const proposals: RawIntegrationProposal[] = [];
    for (const raw of parsed.proposals) {
      const validated = validateProposal(
        raw as Record<string, unknown>,
        artifact,
        validPaperIds,
      );
      if (validated) proposals.push(validated);
    }

    const response: EvidenceIntegrateResponse = { proposals };
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof OpenRouterError) {
      return NextResponse.json(
        { error: err.message, details: err.details },
        { status: 502 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[evidence-integrate] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
