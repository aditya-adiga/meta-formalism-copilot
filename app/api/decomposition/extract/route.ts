import { NextRequest, NextResponse } from "next/server";
import { callLlm, OpenRouterError } from "@/app/lib/llm/callLlm";
import { removeCachedResult } from "@/app/lib/llm/cache";
import type { SourceDocument } from "@/app/lib/types/decomposition";

const OPENROUTER_MODEL = "anthropic/claude-opus-4.6";

const SYSTEM_PROMPT = `You are a mathematical paper analyzer. Given one or more source documents, extract all formal propositions (definitions, lemmas, theorems, propositions, corollaries, axioms) and their dependency relationships.

Each document is identified by a sourceId. Return a JSON array of propositions. Each proposition has:
- "id": a globally unique identifier using the format "<sourceId>/<localId>", e.g. "doc-0/def-1", "doc-1/thm-3"
- "label": the label as it appears in the paper, e.g. "Definition 2.1", "Theorem 3"
- "kind": one of "definition", "lemma", "theorem", "proposition", "corollary", "axiom"
- "statement": the full statement text
- "proofText": the proof text if present, or empty string if none
- "dependsOn": array of IDs this proposition directly depends on (references, uses)
- "sourceId": the sourceId of the document this proposition was extracted from

Important:
- Only include direct dependencies, not transitive ones
- IDs must be consistent across the dependsOn references
- Extract ALL formal statements, even if unnumbered
- Dependencies should be intra-document by default; only create cross-document dependencies if there is an explicit reference
- Return ONLY the JSON array, no commentary or markdown fences`;

/** Format documents array into labeled sections for the user message */
function formatDocuments(documents: SourceDocument[]): string {
  if (documents.length === 1) {
    return `[Document: ${documents[0].sourceId} — "${documents[0].sourceLabel}"]\n\n${documents[0].text}`;
  }
  return documents
    .map((doc) => `[Document: ${doc.sourceId} — "${doc.sourceLabel}"]\n\n${doc.text}`)
    .join("\n\n---\n\n");
}

function mockResponse(documents: SourceDocument[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propositions: any[] = [];

  for (const doc of documents) {
    const snippet = doc.text.slice(0, 60).replace(/\n/g, " ");
    propositions.push(
      {
        id: `${doc.sourceId}/def-1`,
        label: "Definition 1",
        kind: "definition",
        statement: `Mock definition from "${doc.sourceLabel}": "${snippet}..."`,
        proofText: "",
        dependsOn: [],
        sourceId: doc.sourceId,
      },
      {
        id: `${doc.sourceId}/lemma-1`,
        label: "Lemma 1",
        kind: "lemma",
        statement: `Mock lemma from "${doc.sourceLabel}" depending on Definition 1`,
        proofText: "Mock proof using Definition 1.",
        dependsOn: [`${doc.sourceId}/def-1`],
        sourceId: doc.sourceId,
      },
      {
        id: `${doc.sourceId}/thm-1`,
        label: "Theorem 1",
        kind: "theorem",
        statement: `Mock theorem from "${doc.sourceLabel}" depending on Lemma 1`,
        proofText: "Mock proof using Lemma 1.",
        dependsOn: [`${doc.sourceId}/lemma-1`],
        sourceId: doc.sourceId,
      },
    );
  }

  return propositions;
}

/** Strip markdown code fences if present */
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?[\r\n]([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  return raw.trim();
}

/** Parse request body with backward compatibility for { text } format */
function parseDocuments(body: Record<string, unknown>): SourceDocument[] | null {
  if (Array.isArray(body.documents) && body.documents.length > 0) {
    return body.documents as SourceDocument[];
  }
  // Backward compat: wrap plain text as single document
  if (body.text && typeof body.text === "string") {
    return [{ sourceId: "doc-0", sourceLabel: "Text Input", text: body.text }];
  }
  return null;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const documents = parseDocuments(body);

  if (!documents) {
    return NextResponse.json({ error: "documents array or text is required" }, { status: 400 });
  }

  const userMessage = formatDocuments(documents);

  try {
    const { text: responseText, usage, cacheKey } = await callLlm({
      endpoint: "decomposition/extract",
      systemPrompt: SYSTEM_PROMPT,
      userContent: userMessage,
      maxTokens: 16384,
      openRouterModel: OPENROUTER_MODEL,
    });

    if (usage.provider === "mock") {
      return NextResponse.json({ propositions: mockResponse(documents) });
    }

    try {
      const propositions = JSON.parse(extractJson(responseText));
      return NextResponse.json({ propositions });
    } catch {
      if (cacheKey) {
        try { removeCachedResult(cacheKey.model, cacheKey.systemPrompt, cacheKey.userContent, cacheKey.maxTokens); } catch { /* ignore */ }
      }
      const preview = responseText.slice(0, 500);
      console.error("[decomposition/extract] Failed to parse LLM response as JSON:", preview);
      return NextResponse.json(
        { error: "LLM response was not valid JSON", details: preview },
        { status: 502 },
      );
    }
  } catch (err) {
    if (err instanceof OpenRouterError) {
      return NextResponse.json(
        { error: err.message, details: err.details },
        { status: 502 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[decomposition/extract] Unexpected error:", message);
    return NextResponse.json(
      { error: `LLM call failed: ${message}` },
      { status: 502 },
    );
  }
}
