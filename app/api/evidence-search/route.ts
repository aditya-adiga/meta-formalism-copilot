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

const QUERY_SYSTEM_PROMPT = `You generate targeted academic search queries for the OpenAlex paper database.

Given a specific hypothesis or claim, produce 2-3 search queries that would find empirical studies directly testing or measuring the same relationship described.

Critical rules:
- Every query MUST include the core subject matter (e.g., "remote work", "caffeine", "sleep deprivation") — never generate a query that omits the topic
- Use the specific variables and relationship from the claim, not generic methodology terms
- Queries should find papers that measured the SAME outcome, not just papers that used the same statistical method
- Do NOT generate queries about research methods, study design, or statistical techniques in isolation
- Each query should be 3-8 words of topic-specific keywords

Example — if the claim is "remote work does not reduce productivity":
  GOOD: "remote work productivity output comparison"
  GOOD: "telecommuting firm performance empirical"
  BAD: "two-sample t-test company output" (method-focused, no topic)
  BAD: "measurable decline output levels" (too generic, could match anything)

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
    const url = new URL(OPENALEX_API_URL);
    url.searchParams.set("search", query);
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

    // Step 2: Search OpenAlex for each query
    const allWorks: OpenAlexWork[] = [];
    for (const query of queries) {
      const works = await searchOpenAlex(query);
      allWorks.push(...works);
    }

    // Step 3: Filter by relevance score, map, deduplicate, cap results
    // OpenAlex returns relevance_score when using search=; drop results with
    // very low scores (typically < 50% of the top result's score)
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
