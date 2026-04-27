/**
 * API route for overlap and subsumption detection between evidence papers.
 *
 * Given scored papers from an evidence slot, detects which individual studies
 * are already covered by review papers (meta-analyses, systematic reviews)
 * in the same result set. Uses OpenAlex's reference lists as primary signal
 * and LLM abstract comparison as fallback for unmatched pairs.
 */

import { NextRequest, NextResponse } from "next/server";
import { callLlm, OpenRouterError } from "@/app/lib/llm/callLlm";
import { CLAUDE_SONNET } from "@/app/lib/llm/models";
import { stripCodeFences } from "@/app/lib/utils/stripCodeFences";
import { fetchWorksByIds } from "@/app/api/evidence-search/openAlexUtils";
import {
  type EvidenceOverlapRequest,
  type EvidenceOverlapResponse,
  type SubsumptionRelation,
} from "@/app/lib/types/evidence";
import {
  type OverlapPaper,
  partitionPapers,
  buildRelationsFromRefs,
  findUnmatchedPairs,
  derivePaperStatus,
} from "./overlapUtils";

function getOpenAlexMailto(): string {
  const mailto = process.env.OPENALEX_MAILTO;
  if (!mailto) {
    throw new Error(
      "OPENALEX_MAILTO env var is required — OpenAlex's polite pool needs a real contact email. " +
      "See https://docs.openalex.org/how-to-use-the-api/rate-limits-and-authentication",
    );
  }
  return mailto;
}
const MAX_PAPERS = 20;

// ---------------------------------------------------------------------------
// LLM fallback prompt for unmatched pairs
// ---------------------------------------------------------------------------

const OVERLAP_SYSTEM_PROMPT = `You determine whether a review paper (meta-analysis or systematic review) likely includes a specific individual study in its analysis.

For each pair, assess based on the abstracts whether the review would have covered the study. Consider:
- Do they address the same specific topic and population?
- Is the study's methodology type one that the review explicitly includes?
- Are the outcome measures compatible?

Return a JSON object:
{
  "results": [
    {
      "reviewId": "...",
      "studyId": "...",
      "included": true,
      "confidence": 0.8
    }
  ]
}

- "included": true if the review likely includes/covers this study, false otherwise
- "confidence": 0.0-1.0, how confident you are in this assessment
- Only mark as included with confidence >= 0.6 if the topical and methodological overlap is clear`;

const OVERLAP_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "overlap_results",
    strict: true,
    schema: {
      type: "object",
      required: ["results"],
      additionalProperties: false,
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            required: ["reviewId", "studyId", "included", "confidence"],
            additionalProperties: false,
            properties: {
              reviewId: { type: "string" },
              studyId: { type: "string" },
              included: { type: "boolean" },
              confidence: { type: "number" },
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
    const body = (await request.json()) as Partial<EvidenceOverlapRequest>;

    // Validate request
    if (!Array.isArray(body.papers) || body.papers.length === 0) {
      return NextResponse.json(
        { error: "papers array is required and must not be empty" },
        { status: 400 },
      );
    }
    if (body.papers.length > MAX_PAPERS) {
      return NextResponse.json(
        { error: `Too many papers (max ${MAX_PAPERS})` },
        { status: 400 },
      );
    }

    // Validate that papers have reliability scores
    for (let i = 0; i < body.papers.length; i++) {
      const p = body.papers[i];
      if (!p || typeof p.openAlexId !== "string") {
        return NextResponse.json(
          { error: `Paper at index ${i} is missing openAlexId` },
          { status: 400 },
        );
      }
    }

    const papers = body.papers;
    const { reviews, studies } = partitionPapers(papers);
    const reviewIdSet = new Set(reviews.map((r) => r.openAlexId));

    // If no reviews, every paper is "no-reviews" — skip OpenAlex and LLM calls
    if (reviews.length === 0) {
      const response: EvidenceOverlapResponse = {
        analysis: {
          relations: [],
          paperStatus: derivePaperStatus(papers, [], reviewIdSet),
          analyzedAt: new Date().toISOString(),
        },
      };
      return NextResponse.json(response);
    }

    // Step 1: Fetch referenced_works for review papers from OpenAlex
    const reviewIds = [...reviewIdSet];
    const refWorks = await fetchWorksByIds(reviewIds, getOpenAlexMailto());

    // Build a map of review ID → referenced work IDs
    const refsMap = new Map<string, string[]>();
    for (const work of refWorks) {
      if (work.id && work.referenced_works) {
        refsMap.set(work.id, work.referenced_works);
      }
    }

    // Step 2: Build citation-graph relations
    const citationRelations = buildRelationsFromRefs(reviews, studies, refsMap);

    // Step 3: LLM fallback for unmatched pairs
    const unmatchedPairs = findUnmatchedPairs(reviews, studies, citationRelations);
    let llmRelations: SubsumptionRelation[] = [];

    if (unmatchedPairs.length > 0) {
      llmRelations = await classifyOverlapWithLlm(unmatchedPairs);
    }

    // Step 4: Combine relations and derive status
    const allRelations = [...citationRelations, ...llmRelations];
    const paperStatus = derivePaperStatus(papers, allRelations, reviewIdSet);

    const response: EvidenceOverlapResponse = {
      analysis: {
        relations: allRelations,
        paperStatus,
        analyzedAt: new Date().toISOString(),
      },
    };
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof OpenRouterError) {
      return NextResponse.json(
        { error: err.message, details: err.details },
        { status: 502 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[evidence-overlap] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// LLM fallback classification
// ---------------------------------------------------------------------------

type PaperPair = { review: OverlapPaper; study: OverlapPaper };

async function classifyOverlapWithLlm(
  pairs: PaperPair[],
): Promise<SubsumptionRelation[]> {
  const pairDescriptions = pairs.map((pair, i) => {
    const reviewAbstract = pair.review.abstract?.slice(0, 300) ?? "(no abstract)";
    const studyAbstract = pair.study.abstract?.slice(0, 300) ?? "(no abstract)";
    return `Pair ${i + 1}:
  Review (ID: ${pair.review.openAlexId}): "${pair.review.title}" (${pair.review.year ?? "year unknown"})
  Abstract: ${reviewAbstract}
  Study (ID: ${pair.study.openAlexId}): "${pair.study.title}" (${pair.study.year ?? "year unknown"})
  Abstract: ${studyAbstract}`;
  });

  const userMessage = `Assess whether each review paper likely includes the paired individual study:

${pairDescriptions.join("\n\n")}`;

  try {
    const { text } = await callLlm({
      endpoint: "evidence-overlap/classify",
      systemPrompt: OVERLAP_SYSTEM_PROMPT,
      userContent: userMessage,
      maxTokens: 2048,
      openRouterModel: CLAUDE_SONNET,
      responseFormat: OVERLAP_SCHEMA,
    });

    if (!text) return [];

    const parsed = JSON.parse(stripCodeFences(text));
    if (!Array.isArray(parsed.results)) return [];

    const relations: SubsumptionRelation[] = [];
    for (const result of parsed.results) {
      if (
        result.included === true &&
        typeof result.confidence === "number" &&
        result.confidence >= 0.6 &&
        typeof result.reviewId === "string" &&
        typeof result.studyId === "string"
      ) {
        relations.push({
          reviewId: result.reviewId,
          studyId: result.studyId,
          detectionMethod: "llm-fallback",
          confidence: Math.min(Math.max(result.confidence, 0), 1),
        });
      }
    }
    return relations;
  } catch (err) {
    // LLM fallback is best-effort — log and continue with citation-graph results only
    console.error("[evidence-overlap] LLM fallback error:", err);
    return [];
  }
}
