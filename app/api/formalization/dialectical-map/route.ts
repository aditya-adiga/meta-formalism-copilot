import { NextRequest } from "next/server";
import { handleArtifactRoute } from "@/app/lib/formalization/artifactRoute";
import { dialecticalMapSchema } from "@/app/lib/llm/schemas";

const SYSTEM_PROMPT = `You are a dialectical analyst. Given source text and optional context, map the dialectical structure: identify distinct perspectives, their core claims and supporting arguments, tensions between perspectives, and synthesize an equilibrium position.

Return a JSON object with this exact shape:
{
  "topic": "string (the central topic or question being analyzed)",
  "perspectives": [
    {
      "id": "string",
      "label": "string (e.g. 'Utilitarian', 'Deontological')",
      "coreClaim": "string",
      "supportingArguments": ["string"],
      "vulnerabilities": ["string"]
    }
  ],
  "tensions": [
    {
      "between": ["perspectiveId1", "perspectiveId2"],
      "description": "string (nature of the disagreement)"
    }
  ],
  "synthesis": {
    "equilibrium": "string (the synthesized position)",
    "howAddressed": [
      {
        "perspectiveId": "string",
        "resolution": "string (how this perspective's concern is addressed)"
      }
    ]
  },
  "summary": "string (2-4 sentence summary of the dialectical landscape)"
}

Important:
- Perspective IDs must be short, lowercase, hyphenated
- Each perspective needs at least one supporting argument and one vulnerability
- Tensions must reference valid perspective IDs
- The synthesis should genuinely address each perspective's concerns, not just pick a winner
- Return ONLY the JSON object, no commentary or markdown fences`;

function mockResponse(sourceText: string) {
  const snippet = sourceText.slice(0, 60).replace(/\n/g, " ");
  return {
    topic: `Analysis of: "${snippet}..."`,
    perspectives: [
      {
        id: "perspective-a",
        label: "Perspective A",
        coreClaim: "Mock perspective emphasizing one interpretation",
        supportingArguments: ["Supporting argument 1", "Supporting argument 2"],
        vulnerabilities: ["Vulnerability: limited scope"],
      },
      {
        id: "perspective-b",
        label: "Perspective B",
        coreClaim: "Mock perspective emphasizing an alternative interpretation",
        supportingArguments: ["Counter-argument 1"],
        vulnerabilities: ["Vulnerability: lacks empirical support"],
      },
    ],
    tensions: [
      {
        between: ["perspective-a", "perspective-b"] as [string, string],
        description: "Fundamental disagreement about interpretation approach",
      },
    ],
    synthesis: {
      equilibrium: "A balanced position that integrates both perspectives",
      howAddressed: [
        { perspectiveId: "perspective-a", resolution: "Scope concern addressed by limiting claims" },
        { perspectiveId: "perspective-b", resolution: "Empirical gap addressed by identifying testable predictions" },
      ],
    },
    summary: "Mock dialectical map with two opposing perspectives and a synthesis.",
  };
}

export async function POST(request: NextRequest) {
  return handleArtifactRoute(request, {
    endpoint: "formalization/dialectical-map",
    systemPrompt: SYSTEM_PROMPT,
    responseKey: "dialecticalMap",
    mockResponse,
    responseFormat: dialecticalMapSchema,
  });
}
