import { NextRequest } from "next/server";
import { handleArtifactRoute } from "@/app/lib/formalization/artifactRoute";
import { statisticalModelSchema } from "@/app/lib/llm/schemas";

const SYSTEM_PROMPT = `You are a statistical reasoning analyst. Given source text and optional context, extract the statistical structure: identify variables with their roles, formulate testable hypotheses with null hypotheses and suggested tests, list statistical assumptions, and note sample requirements.

Return a JSON object with this exact shape:
{
  "variables": [
    {
      "id": "string",
      "label": "string",
      "role": "independent" | "dependent" | "confounding" | "control",
      "distribution": "string (optional, e.g. 'Normal(0, 1)', 'Bernoulli(0.3)')"
    }
  ],
  "hypotheses": [
    {
      "id": "string",
      "statement": "string (e.g. 'X is positively correlated with Y')",
      "nullHypothesis": "string",
      "testSuggestion": "string (e.g. 'two-sample t-test')"
    }
  ],
  "assumptions": ["string (e.g. 'independence of observations')"],
  "sampleRequirements": "string (optional, e.g. 'n >= 30 per group')",
  "summary": "string (2-4 sentence summary of the statistical model)"
}

Important:
- Variable IDs must be short, lowercase, hyphenated
- Each hypothesis must have a clear null hypothesis and a concrete test suggestion
- List all implicit statistical assumptions (normality, independence, etc.)
- Return ONLY the JSON object, no commentary or markdown fences`;

function mockResponse(sourceText: string) {
  const snippet = sourceText.slice(0, 60).replace(/\n/g, " ");
  return {
    variables: [
      { id: "treatment", label: "Treatment Group", role: "independent" as const },
      { id: "outcome", label: "Outcome Measure", role: "dependent" as const, distribution: "Normal(μ, σ²)" },
    ],
    hypotheses: [
      {
        id: "h1",
        statement: "Treatment group shows higher outcome measures",
        nullHypothesis: "No difference in outcome between treatment and control groups",
        testSuggestion: "Two-sample t-test",
      },
    ],
    assumptions: ["Independence of observations", "Normal distribution of outcome variable"],
    sampleRequirements: "n >= 30 per group for CLT approximation",
    summary: `Mock statistical model extracted from: "${snippet}...". Treatment is hypothesized to affect Outcome.`,
  };
}

export async function POST(request: NextRequest) {
  return handleArtifactRoute(request, {
    endpoint: "formalization/statistical-model",
    systemPrompt: SYSTEM_PROMPT,
    responseKey: "statisticalModel",
    mockResponse,
    responseFormat: statisticalModelSchema,
  });
}
