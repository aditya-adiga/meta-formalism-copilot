import { NextRequest, NextResponse } from "next/server";
import { handleArtifactRoute } from "@/app/lib/formalization/artifactRoute";

const MAX_SYSTEM_PROMPT_LENGTH = 10_000;

/**
 * Generic route for custom artifact types. The system prompt and output format
 * are provided in the request body (since they're user-defined, not baked into
 * a route file like built-in types).
 *
 * Reuses handleArtifactRoute with a transformBody that extracts the custom
 * fields from the request and injects them as route config.
 *
 * Security note: The system prompt is user-authored content. This is by design —
 * custom artifact types let the user define their own LLM instructions. The trust
 * model is that the user is also the operator; there is no multi-tenant separation.
 * The MAX_SYSTEM_PROMPT_LENGTH limit bounds resource usage, not content.
 * See docs/decisions/005-custom-artifact-trust-model.md for rationale.
 */
export async function POST(request: NextRequest) {
  // We need to peek at the body to get the custom config, then let
  // handleArtifactRoute re-parse it. Clone the request so the body
  // can be consumed twice.
  const cloned = request.clone();
  const rawBody = await cloned.json();
  const { customSystemPrompt, customOutputFormat } = rawBody;

  if (!customSystemPrompt || typeof customSystemPrompt !== "string") {
    return NextResponse.json({ error: "customSystemPrompt is required" }, { status: 400 });
  }

  if (customSystemPrompt.length > MAX_SYSTEM_PROMPT_LENGTH) {
    return NextResponse.json(
      { error: `customSystemPrompt exceeds maximum length of ${MAX_SYSTEM_PROMPT_LENGTH} characters` },
      { status: 400 },
    );
  }

  return handleArtifactRoute(request, {
    endpoint: "formalization/custom",
    systemPrompt: customSystemPrompt,
    responseKey: "result",
    parseResponse: customOutputFormat === "text" ? "text" : "json",
    mockResponse: (sourceText) =>
      customOutputFormat === "text"
        ? `Mock custom result for: ${sourceText.slice(0, 60)}...`
        : { summary: `Mock custom result for: ${sourceText.slice(0, 60)}...` },
    // Strip the custom-specific fields before buildUserMessage processes the body
    transformBody: (body) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip custom-specific fields before buildUserMessage
      const { customSystemPrompt, customOutputFormat, ...rest } = body;
      return rest as import("@/app/lib/types/artifacts").ArtifactGenerationRequest;
    },
  });
}
