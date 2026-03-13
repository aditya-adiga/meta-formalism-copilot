import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import type { SourceDocument } from "@/app/lib/types/decomposition";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "anthropic/claude-opus-4.6";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

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

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const client = new Anthropic({ apiKey: anthropicKey });
    const message = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 16384,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    const propositions = JSON.parse(extractJson(raw));
    return NextResponse.json({ propositions });
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    console.warn("[decomposition/extract] No API key configured — returning mock response.");
    return NextResponse.json({ propositions: mockResponse(documents) });
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openRouterKey}`,
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("[decomposition/extract] OpenRouter error:", response.status, errorBody);
    return NextResponse.json(
      { error: `OpenRouter API error: ${response.status}`, details: errorBody },
      { status: 502 },
    );
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content ?? "";
  const propositions = JSON.parse(extractJson(raw));
  return NextResponse.json({ propositions });
}
