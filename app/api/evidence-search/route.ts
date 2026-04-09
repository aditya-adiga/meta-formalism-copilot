import { NextRequest, NextResponse } from "next/server";
import { callLlm, OpenRouterError } from "@/app/lib/llm/callLlm";
import { CLAUDE_SONNET } from "@/app/lib/llm/models";
import { stripCodeFences } from "@/app/lib/utils/stripCodeFences";
import { mapOpenAlexWork, deduplicatePapers, type OpenAlexWork } from "./openAlexUtils";
import type { EvidenceSearchRequest, EvidenceSearchResponse } from "@/app/lib/types/evidence";

const OPENALEX_API_URL = "https://api.openalex.org/works";
const OPENALEX_TIMEOUT_MS = 10_000;
const OPENALEX_MAILTO = "metaformalism-copilot@example.com";
const MAX_RESULTS = 10;
const PER_QUERY_RESULTS = 5;

// ---------------------------------------------------------------------------
// LLM query generation
// ---------------------------------------------------------------------------

const QUERY_SYSTEM_PROMPT = `You generate targeted academic search queries for finding published research papers.

Given a claim, hypothesis, or scenario from a research artifact, produce 2-4 concise keyword-style search queries suitable for an academic paper database (OpenAlex).

Guidelines:
- Use specific technical terms, not natural language questions
- Include key variables, methods, or phenomena mentioned
- Vary queries to cover different angles (e.g., one for the specific claim, one broader)
- Keep each query under 10 words

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
  return parsed.queries.slice(0, 4);
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

    // Step 3: Map, deduplicate, cap results
    const papers = deduplicatePapers(allWorks.map(mapOpenAlexWork)).slice(0, MAX_RESULTS);

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
