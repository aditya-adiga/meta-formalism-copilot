import { NextRequest } from "next/server";
import { handleArtifactRoute } from "@/app/lib/formalization/artifactRoute";

const SYSTEM_PROMPT = `You are an adversarial analyst specializing in finding counterexamples. Given source text and optional context, identify the core claim or thesis and generate specific, concrete scenarios that could falsify or undermine it. Focus on realistic counterexamples that expose hidden assumptions, boundary conditions, or overlooked edge cases.

Return a JSON object with this exact shape:
{
  "claim": "string (the core claim or thesis being tested)",
  "counterexamples": [
    {
      "id": "string (short, lowercase, hyphenated)",
      "scenario": "string (concrete description of the counterexample)",
      "targetAssumption": "string (which assumption or condition this challenges)",
      "explanation": "string (why this counterexample is effective — what breaks)",
      "plausibility": "high | medium | low",
      "isEmpirical": "boolean (true if relies on empirical claims, false if purely logical)"
    }
  ],
  "robustnessAssessment": "string (overall assessment of how robust the claim is given these counterexamples)",
  "summary": "string (2-4 sentence summary of the adversarial analysis)"
}

Important:
- IDs must be short, lowercase, hyphenated (e.g. "cx-1", "cx-scope-limit")
- Counterexamples should be specific and concrete, not vague objections
- Include a mix of plausibility levels — some obvious, some subtle
- Target different assumptions where possible
- The robustness assessment should be balanced and constructive
- Set isEmpirical to true when the counterexample relies on empirical claims (data, studies, real-world observations). Set false for purely logical, mathematical, or definitional counterexamples.
- For empirical counterexamples (isEmpirical: true), use hypothetical framing: describe what kind of evidence *would* contradict the thesis, not that such evidence exists. Example: "If longitudinal data showed X decreases under condition Y, this would undermine the assumption that..."
- NEVER fabricate specific citations, study names, author names, statistics, or data points
- Return ONLY the JSON object, no commentary or markdown fences`;

function mockResponse(sourceText: string) {
  const snippet = sourceText.slice(0, 60).replace(/\n/g, " ");
  return {
    claim: `Mock claim from: "${snippet}..."`,
    counterexamples: [
      {
        id: "cx-1",
        scenario: "A scenario where the stated conditions hold but the conclusion fails due to an unstated boundary condition.",
        targetAssumption: "Implicit assumption that the domain is unbounded",
        explanation: "The claim implicitly assumes no boundary effects, but in finite domains this breaks down.",
        plausibility: "medium" as const,
        isEmpirical: false,
      },
      {
        id: "cx-2",
        scenario: "If empirical studies showed the effect reverses under high-stress conditions, this would undermine the implicit assumption of context-independence.",
        targetAssumption: "Implicit assumption that the effect is context-independent",
        explanation: "The claim does not account for moderating variables. If data demonstrated context-dependence, the universal framing would fail.",
        plausibility: "high" as const,
        isEmpirical: true,
      },
    ],
    robustnessAssessment: "Mock assessment: the claim appears moderately robust but has at least one exploitable assumption.",
    summary: "Mock counterexample analysis with one medium-plausibility counterexample targeting boundary conditions.",
  };
}

export async function POST(request: NextRequest) {
  return handleArtifactRoute(request, {
    endpoint: "formalization/counterexamples",
    systemPrompt: SYSTEM_PROMPT,
    responseKey: "counterexamples",
    mockResponse,
  });
}
