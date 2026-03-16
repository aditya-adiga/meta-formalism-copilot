import { NextRequest, NextResponse } from "next/server";
import { callLlm, OpenRouterError } from "@/app/lib/llm/callLlm";
import { removeCachedResult } from "@/app/lib/llm/cache";
import { decompositionSchema } from "@/app/lib/llm/schemas";
import type { SourceDocument } from "@/app/lib/types/decomposition";
import { stripCodeFences } from "@/app/lib/utils/stripCodeFences";
import { CLAUDE_OPUS as OPENROUTER_MODEL } from "@/app/lib/llm/models";

const SYSTEM_PROMPT = `You are a document structure analyzer. Given one or more source documents, decompose the content into its key structural units and their dependency/support relationships.

Adapt your extraction to the document type:
- For mathematical papers: extract definitions, lemmas, theorems, propositions, corollaries, axioms
- For argumentative essays: extract the thesis (as "claim"), supporting arguments (as "claim" or "evidence"), assumptions, objections, and rebuttals
- For empirical/scientific writing: extract hypotheses (as "claim"), methodology, observations, evidence, and conclusions
- For mixed or informal content: extract claims, questions, assumptions, observations, and narrative context

Each document is identified by a sourceId. Return a JSON object with a "propositions" key containing an array of nodes. Each node has:
- "id": a globally unique identifier using the format "<sourceId>/<localId>", e.g. "doc-0/claim-1", "doc-0/def-1"
- "label": a short descriptive label, e.g. "Main Thesis", "Definition 2.1", "Supporting Evidence 3"
- "kind": one of "definition", "lemma", "theorem", "proposition", "corollary", "axiom", "claim", "evidence", "assumption", "objection", "rebuttal", "question", "observation", "narrative", "methodology", "conclusion"
- "statement": the full text of this unit
- "proofText": supporting reasoning, proof, or elaboration if present, or empty string if none
- "dependsOn": array of IDs this node directly depends on or references
- "sourceId": the sourceId of the document this node was extracted from

Important:
- Choose the kind that best fits each unit — use mathematical kinds for formal math, argumentative kinds for arguments and essays
- Only include direct dependencies, not transitive ones
- IDs must be consistent across the dependsOn references
- Extract ALL meaningful structural units, even if unlabeled in the source
- Aim for 3-15 nodes per document — enough to capture structure without excessive fragmentation
- When multiple documents are provided, look for cross-document dependencies where one document's propositions build on, reference, or share concepts with another's. Dependencies may be explicit (direct citation) or implicit (shared definitions, overlapping claims)
- Return ONLY the JSON object, no commentary or markdown fences`;

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

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const snippet = doc.text.slice(0, 60).replace(/\n/g, " ");
    // For multi-doc, later documents depend on the first document's definition
    // to demonstrate cross-document connectivity
    const defDeps: string[] =
      i > 0 ? [`${documents[0].sourceId}/def-1`] : [];
    propositions.push(
      {
        id: `${doc.sourceId}/claim-1`,
        label: "Main Claim",
        kind: "claim",
        statement: `Mock claim from "${doc.sourceLabel}": "${snippet}..."`,
        proofText: "",
        dependsOn: defDeps,
        sourceId: doc.sourceId,
      },
      {
        id: `${doc.sourceId}/evidence-1`,
        label: "Supporting Evidence 1",
        kind: "evidence",
        statement: `Mock evidence from "${doc.sourceLabel}" supporting Main Claim`,
        proofText: "",
        dependsOn: [`${doc.sourceId}/claim-1`],
        sourceId: doc.sourceId,
      },
      {
        id: `${doc.sourceId}/conclusion-1`,
        label: "Conclusion",
        kind: "conclusion",
        statement: `Mock conclusion from "${doc.sourceLabel}" based on evidence`,
        proofText: "",
        dependsOn: [`${doc.sourceId}/evidence-1`],
        sourceId: doc.sourceId,
      },
    );
  }

  return propositions;
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
      responseFormat: decompositionSchema,
    });

    if (usage.provider === "mock") {
      return NextResponse.json({ propositions: mockResponse(documents) });
    }

    try {
      const parsed = JSON.parse(stripCodeFences(responseText));
      // Support both wrapped { propositions: [...] } and legacy bare array formats
      const propositions = Array.isArray(parsed) ? parsed : parsed.propositions;
      return NextResponse.json({ propositions });
    } catch {
      // JSON parse failed — invalidate the cached bad response
      if (cacheKey) {
        try { await removeCachedResult(cacheKey.model, cacheKey.systemPrompt, cacheKey.userContent, cacheKey.maxTokens); } catch { /* ignore */ }
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
