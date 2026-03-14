import { NextRequest } from "next/server";
import { handleArtifactRoute } from "@/app/lib/formalization/artifactRoute";

const SYSTEM_PROMPT = `You are a causal reasoning analyst. Given source text and optional context, extract the causal structure: identify variables, causal relationships (edges), potential confounders, and summarize the causal model.

Return a JSON object with this exact shape:
{
  "variables": [
    { "id": "string", "label": "string", "description": "string" }
  ],
  "edges": [
    {
      "from": "string (variable id)",
      "to": "string (variable id)",
      "weight": number (-1 to 1, strength and direction),
      "mechanism": "string (brief explanation of the causal pathway)"
    }
  ],
  "confounders": [
    {
      "id": "string",
      "label": "string",
      "affectedEdges": ["from->to keys of edges this confounder affects"]
    }
  ],
  "summary": "string (natural language summary of the causal structure)"
}

Important:
- Variable IDs must be short, lowercase, hyphenated (e.g. "sleep-quality", "stress-level")
- Edge "from" and "to" must reference valid variable IDs
- Weight should reflect both strength (magnitude) and direction (positive/negative)
- Include confounders only when the source text implies or explicitly mentions them
- The summary should be 2-4 sentences explaining the overall causal picture
- Return ONLY the JSON object, no commentary or markdown fences`;

function mockResponse(sourceText: string) {
  const snippet = sourceText.slice(0, 60).replace(/\n/g, " ");
  return {
    variables: [
      { id: "var-a", label: "Variable A", description: `Mock variable from: "${snippet}..."` },
      { id: "var-b", label: "Variable B", description: "Mock dependent variable" },
    ],
    edges: [
      { from: "var-a", to: "var-b", weight: 0.7, mechanism: "Mock causal mechanism" },
    ],
    confounders: [],
    summary: `Mock causal graph extracted from source text. Variable A causes Variable B via a mock mechanism.`,
  };
}

export async function POST(request: NextRequest) {
  return handleArtifactRoute(request, {
    endpoint: "formalization/causal-graph",
    systemPrompt: SYSTEM_PROMPT,
    responseKey: "causalGraph",
    mockResponse,
  });
}
