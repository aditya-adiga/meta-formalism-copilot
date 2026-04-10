/**
 * API route for scoring evidence papers against a claim.
 *
 * Takes a claim and a list of papers, returns reliability and relatedness
 * scores for each paper. Uses the LLM to classify study type, assess
 * methodology, and judge relevance to the specific claim.
 */

import { NextRequest, NextResponse } from "next/server";
import { callLlm, OpenRouterError } from "@/app/lib/llm/callLlm";
import { CLAUDE_SONNET } from "@/app/lib/llm/models";
import { stripCodeFences } from "@/app/lib/utils/stripCodeFences";
import {
  STUDY_TYPES,
  type EvidenceScoreRequest,
  type EvidenceScoreResponse,
  type PaperScore,
} from "@/app/lib/types/evidence";
import { validatePaperScore } from "./scoreValidation";

const MAX_PAPERS_PER_REQUEST = 10;
const MAX_CLAIM_LENGTH = 5000;

// ---------------------------------------------------------------------------
// LLM scoring prompt
// ---------------------------------------------------------------------------

const SCORING_SYSTEM_PROMPT = `You assess academic papers for reliability and relevance to a specific claim.

For each paper, you must provide:

1. **Reliability assessment:**
   - Classify the study type from this hierarchy (ordered from most to least reliable):
     meta-analysis, systematic-review, rct, cohort, case-control, cross-sectional, case-study, expert-opinion, unknown
   - Score from 0.0 to 1.0 based on study type AND methodology quality
   - Identify red flags: p-hacking indicators (many variables tested, p-values barely below 0.05), inadequate sample sizes, conflicts of interest, retraction concerns
   - Provide a brief rationale (1-2 sentences)

2. **Relatedness assessment:**
   - Score from 0.0 to 1.0 based on how directly relevant the paper is to the specific claim
   - 1.0 = directly tests or addresses the exact claim
   - 0.5 = related topic but different specific question
   - 0.0 = unrelated despite keyword overlap
   - Provide a brief rationale (1-2 sentences)

Scoring guidelines for reliability:
- meta-analysis with good methodology: 0.85-1.0
- systematic-review: 0.75-0.90
- rct: 0.65-0.85
- cohort: 0.50-0.70
- case-control: 0.40-0.60
- cross-sectional: 0.30-0.50
- case-study: 0.15-0.30
- expert-opinion: 0.05-0.20
- unknown: 0.10-0.30
Adjust within these ranges based on methodology quality and red flags.

If a paper's abstract is missing, score conservatively (lower reliability, note limited information).

Return a JSON object with this exact shape:
{
  "scores": [
    {
      "openAlexId": "the paper's ID",
      "reliability": {
        "score": 0.75,
        "studyType": "rct",
        "rationale": "Well-designed RCT with adequate sample size.",
        "redFlags": []
      },
      "relatedness": {
        "score": 0.8,
        "rationale": "Directly tests the relationship described in the claim."
      }
    }
  ]
}`;

const SCORING_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "evidence_scores",
    strict: true,
    schema: {
      type: "object",
      required: ["scores"],
      additionalProperties: false,
      properties: {
        scores: {
          type: "array",
          items: {
            type: "object",
            required: ["openAlexId", "reliability", "relatedness"],
            additionalProperties: false,
            properties: {
              openAlexId: { type: "string" },
              reliability: {
                type: "object",
                required: ["score", "studyType", "rationale", "redFlags"],
                additionalProperties: false,
                properties: {
                  score: { type: "number" },
                  studyType: {
                    type: "string",
                    enum: [...STUDY_TYPES],
                  },
                  rationale: { type: "string" },
                  redFlags: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
              },
              relatedness: {
                type: "object",
                required: ["score", "rationale"],
                additionalProperties: false,
                properties: {
                  score: { type: "number" },
                  rationale: { type: "string" },
                },
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
    const body = (await request.json()) as Partial<EvidenceScoreRequest>;

    // Validate request
    if (!body.claimContent || typeof body.claimContent !== "string") {
      return NextResponse.json({ error: "claimContent is required" }, { status: 400 });
    }
    if (!Array.isArray(body.papers) || body.papers.length === 0) {
      return NextResponse.json({ error: "papers array is required and must not be empty" }, { status: 400 });
    }
    if (body.papers.length > MAX_PAPERS_PER_REQUEST) {
      return NextResponse.json(
        { error: `Too many papers (max ${MAX_PAPERS_PER_REQUEST})` },
        { status: 400 },
      );
    }

    const claimContent = body.claimContent.slice(0, MAX_CLAIM_LENGTH);

    // Build user message with claim and paper summaries
    const paperSummaries = body.papers.map((p, i) => {
      const parts = [`Paper ${i + 1} (ID: ${p.openAlexId}):`];
      parts.push(`  Title: ${p.title}`);
      if (p.authors.length > 0) parts.push(`  Authors: ${p.authors.slice(0, 5).join(", ")}`);
      if (p.year) parts.push(`  Year: ${p.year}`);
      if (p.journal) parts.push(`  Journal: ${p.journal}`);
      if (p.abstract) parts.push(`  Abstract: ${p.abstract.slice(0, 500)}`);
      else parts.push("  Abstract: (not available)");
      return parts.join("\n");
    });

    const userMessage = `Claim to evaluate papers against:
${claimContent}

Papers to score:
${paperSummaries.join("\n\n")}`;

    const { text } = await callLlm({
      endpoint: "evidence-score",
      systemPrompt: SCORING_SYSTEM_PROMPT,
      userContent: userMessage,
      maxTokens: 4096,
      openRouterModel: CLAUDE_SONNET,
      responseFormat: SCORING_SCHEMA,
    });

    if (!text) {
      // Mock fallback — return neutral scores
      const scores: PaperScore[] = body.papers.map((p) => ({
        openAlexId: p.openAlexId,
        reliability: {
          score: 0.5,
          studyType: "unknown" as const,
          rationale: "Scoring unavailable (no API key configured).",
          redFlags: [],
        },
        relatedness: {
          score: 0.5,
          rationale: "Scoring unavailable (no API key configured).",
        },
      }));
      return NextResponse.json({ scores } satisfies EvidenceScoreResponse);
    }

    // Parse and validate LLM response
    const parsed = JSON.parse(stripCodeFences(text));
    if (!Array.isArray(parsed.scores)) {
      return NextResponse.json({ error: "Invalid LLM response format" }, { status: 502 });
    }

    const scores: PaperScore[] = [];
    for (const raw of parsed.scores) {
      const validated = validatePaperScore(raw as Record<string, unknown>);
      if (validated) scores.push(validated);
    }

    const response: EvidenceScoreResponse = { scores };
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof OpenRouterError) {
      return NextResponse.json(
        { error: err.message, details: err.details },
        { status: 502 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[evidence-score] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
