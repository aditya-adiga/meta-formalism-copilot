import { NextRequest } from "next/server";
import { handleArtifactRoute } from "@/app/lib/formalization/artifactRoute";
import { propertyTestsSchema } from "@/app/lib/llm/schemas";

const SYSTEM_PROMPT = `You are a property-based testing specification analyst. Given source text and optional context, identify testable properties: invariants, preconditions, postconditions, and boundary behaviors. Express each as a pseudocode specification with data generators.

Return a JSON object with this exact shape:
{
  "properties": [
    {
      "id": "string",
      "name": "string (e.g. 'sortPreservesLength')",
      "description": "string (what this property checks)",
      "preconditions": "string (input constraints)",
      "postcondition": "string (what must hold)",
      "pseudocode": "string (executable-style specification)"
    }
  ],
  "dataGenerators": [
    {
      "name": "string",
      "description": "string (how to generate test inputs)",
      "constraints": "string (bounds, types, edge cases)"
    }
  ],
  "summary": "string (2-4 sentence summary of the property test suite)"
}

Important:
- Property IDs must be short, lowercase, hyphenated
- Pseudocode should be language-agnostic but precise enough to implement
- Include edge cases and boundary conditions in data generators
- Properties should be independently testable
- Return ONLY the JSON object, no commentary or markdown fences`;

function mockResponse(sourceText: string) {
  const snippet = sourceText.slice(0, 60).replace(/\n/g, " ");
  return {
    properties: [
      {
        id: "prop-1",
        name: "inputOutputConsistency",
        description: `Mock property from: "${snippet}..."`,
        preconditions: "input is non-empty",
        postcondition: "output preserves all input elements",
        pseudocode: "forall xs: List[T],\n  length(process(xs)) == length(xs)",
      },
    ],
    dataGenerators: [
      {
        name: "arbitraryList",
        description: "Generate random lists of varying length",
        constraints: "Length 0-1000, elements drawn from domain",
      },
    ],
    summary: "Mock property test suite with one consistency property and one data generator.",
  };
}

export async function POST(request: NextRequest) {
  return handleArtifactRoute(request, {
    endpoint: "formalization/property-tests",
    systemPrompt: SYSTEM_PROMPT,
    responseKey: "propertyTests",
    mockResponse,
    responseFormat: propertyTestsSchema,
  });
}
