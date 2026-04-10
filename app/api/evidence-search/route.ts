import { NextRequest, NextResponse } from "next/server";
import { callLlm, OpenRouterError } from "@/app/lib/llm/callLlm";
import { CLAUDE_SONNET } from "@/app/lib/llm/models";
import { stripCodeFences } from "@/app/lib/utils/stripCodeFences";
import { mapOpenAlexWork, deduplicatePapers, type OpenAlexWork } from "./openAlexUtils";
import type { EvidenceSearchRequest, EvidenceSearchResponse } from "@/app/lib/types/evidence";

const OPENALEX_API_URL = "https://api.openalex.org/works";
const OPENALEX_TIMEOUT_MS = 10_000;
const OPENALEX_MAILTO = "metaformalism-copilot@example.com";
const MAX_RESULTS = 8;
const PER_QUERY_RESULTS = 5;

// ---------------------------------------------------------------------------
// LLM query generation
// ---------------------------------------------------------------------------

const QUERY_SYSTEM_PROMPT = `You generate short academic search queries for the OpenAlex paper database.

Given a specific hypothesis or claim, produce 2-3 search queries that would find empirical studies about the same topic.

Critical rules:
- Each query MUST be exactly 3-5 words. No more. Longer queries dilute relevance.
- Every query MUST include the core subject (e.g., "remote work", "caffeine", "sleep deprivation")
- Add only 1-2 specific terms beyond the core subject to narrow the search
- Do NOT include generic academic words like "comparison", "output", "performance", "analysis", "study", "effect", "impact" — these match everything
- Do NOT include methodology terms like "t-test", "regression", "sample"
- Each query should approach the topic from a different angle (e.g., different terminology, different aspect)

Example — if the claim is "remote work does not reduce productivity":
  GOOD: "remote work productivity" (3 words, topic-focused)
  GOOD: "telecommuting firm performance" (3 words, alternate terminology)
  GOOD: "work from home employee output" (5 words, different framing)
  BAD: "remote work productivity output performance comparison" (too many words, diluted)
  BAD: "measurable decline output levels" (no core subject)

Return a JSON object with this exact shape:
{
  "queries": ["query 1", "query 2", ...]
}`;

const QUERY_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "search_queries",
    strict: true,
    schema: {
      type: "object",
      required: ["queries"],
      additionalProperties: false,
      properties: {
        queries: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  },
};

async function generateSearchQueries(
  elementContent: string,
  contextSummary?: string,
): Promise<string[]> {
  const userMessage = contextSummary
    ? `Context: ${contextSummary}\n\nElement to find evidence for:\n${elementContent}`
    : `Element to find evidence for:\n${elementContent}`;

  const { text } = await callLlm({
    endpoint: "evidence-search/generate-queries",
    systemPrompt: QUERY_SYSTEM_PROMPT,
    userContent: userMessage,
    maxTokens: 1024,
    openRouterModel: CLAUDE_SONNET,
    responseFormat: QUERY_SCHEMA,
  });

  if (!text) return [elementContent.slice(0, 100)]; // fallback: use element content as query

  const parsed = JSON.parse(stripCodeFences(text));
  if (!Array.isArray(parsed.queries) || parsed.queries.length === 0) {
    return [elementContent.slice(0, 100)];
  }
  return parsed.queries.slice(0, 3);
}

// ---------------------------------------------------------------------------
// OpenAlex search
// ---------------------------------------------------------------------------

async function searchOpenAlex(query: string): Promise<OpenAlexWork[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENALEX_TIMEOUT_MS);

  try {
    // Use title_and_abstract.search instead of the general search= parameter.
    // The general search does full-text matching which returns highly-cited but
    // irrelevant papers that happen to mention common words in their body text.
    const url = new URL(OPENALEX_API_URL);
    url.searchParams.set("filter", `title_and_abstract.search:${query}`);
    url.searchParams.set("per_page", String(PER_QUERY_RESULTS));
    url.searchParams.set("mailto", OPENALEX_MAILTO);

    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[evidence-search] OpenAlex returned ${res.status} for query: ${query}`);
      return [];
    }

    const data = await res.json();
    return (data.results ?? []) as OpenAlexWork[];
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      console.error(`[evidence-search] OpenAlex timeout for query: ${query}`);
    } else {
      console.error("[evidence-search] OpenAlex error:", err);
    }
    return [];
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<EvidenceSearchRequest>;

    if (!body.elementContent || typeof body.elementContent !== "string") {
      return NextResponse.json({ error: "elementContent is required" }, { status: 400 });
    }
    if (!body.artifactType || !body.elementId) {
      return NextResponse.json({ error: "artifactType and elementId are required" }, { status: 400 });
    }

    // Step 1: Generate search queries via LLM
    const queries = await generateSearchQueries(body.elementContent, body.contextSummary);

    // Step 2: Search OpenAlex for all queries in parallel
    const queryResults = await Promise.allSettled(queries.map(searchOpenAlex));
    const allWorks: OpenAlexWork[] = [];
    for (const result of queryResults) {
      if (result.status === "fulfilled") {
        allWorks.push(...result.value);
      }
    }

    // Step 3: Filter by relevance score, map, deduplicate, cap results
    // OpenAlex returns relevance_score with title_and_abstract.search filter;
    // drop results with very low scores (< 40% of the top result's score)
    const topScore = Math.max(...allWorks.map((w) => w.relevance_score ?? 0), 1);
    const relevanceThreshold = topScore * 0.4;
    const relevantWorks = allWorks.filter(
      (w) => (w.relevance_score ?? 0) >= relevanceThreshold,
    );
    const papers = deduplicatePapers(relevantWorks.map(mapOpenAlexWork)).slice(0, MAX_RESULTS);

    const response: EvidenceSearchResponse = { queries, papers };
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof OpenRouterError) {
      return NextResponse.json(
        { error: err.message, details: err.details },
        { status: 502 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[evidence-search] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
