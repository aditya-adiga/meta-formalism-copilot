import type { PropositionNode, NodeArtifact } from "@/app/lib/types/decomposition";
import type { ArtifactType, BuiltinArtifactType } from "@/app/lib/types/session";
import { isCustomType, type CustomArtifactTypeDefinition } from "@/app/lib/types/customArtifact";
import type { ArtifactGenerationRequest } from "@/app/lib/types/artifacts";
import { gatherDependencyContext } from "@/app/lib/utils/leanContext";
import { generateSemiformal, fetchApi } from "@/app/lib/formalization/api";
import { leanRetryLoop } from "@/app/lib/formalization/leanRetryLoop";
import { ARTIFACT_ROUTE, ARTIFACT_RESPONSE_KEY } from "@/app/lib/types/artifacts";

/** Simple cancellation signal checked between async steps. */
export type CancelSignal = { cancelled: boolean };

/**
 * Run the full formalization pipeline for a single node:
 * semiformal → Lean generation × 3 attempts → verify.
 *
 * Updates node state via `updateNode` at each step.
 * Returns "verified" or "failed".
 */
export async function formalizeNode(
  node: PropositionNode,
  allNodes: PropositionNode[],
  updateNode: (id: string, updates: Partial<PropositionNode>) => void,
  signal?: CancelSignal,
  artifactTypes?: ArtifactType[],
  contextText?: string,
  /**
   * Definitions for custom artifact types selected via "Generate All". The
   * queue needs these to dispatch custom types to /api/formalization/custom
   * (the per-node path in useArtifactGeneration uses the same route).
   * Omit or pass [] to skip custom types — matches the legacy behavior.
   */
  customTypeDefs?: CustomArtifactTypeDefinition[],
): Promise<"verified" | "failed"> {
  // If no artifact types specified, default to legacy deductive pipeline
  const types = artifactTypes && artifactTypes.length > 0 ? artifactTypes : ["semiformal" as ArtifactType];
  const hasSemiformal = types.includes("semiformal");
  const nonDeductiveTypes = types.filter((t) => t !== "semiformal" && t !== "lean");

  updateNode(node.id, { verificationStatus: "in-progress", verificationErrors: "" });

  try {
    const nodeText = `${node.statement}\n\n${node.proofText}`;
    const context = node.context || contextText || "";
    let deductiveResult: "verified" | "failed" = "verified";

    // Run deductive pipeline (semiformal → Lean → verify) if selected
    if (hasSemiformal) {
      const proof = await generateSemiformal(nodeText, context);
      if (signal?.cancelled) {
        updateNode(node.id, { verificationStatus: "unverified", verificationErrors: "" });
        return "failed";
      }
      updateNode(node.id, { semiformalProof: proof });

      const depContext = gatherDependencyContext(allNodes, node.id);
      const result = await leanRetryLoop(proof, {
        onLeanCode: (code) => updateNode(node.id, { leanCode: code }),
        onErrors: (errors) => updateNode(node.id, { verificationErrors: errors }),
        isCancelled: () => signal?.cancelled ?? false,
        dependencyContext: depContext || undefined,
      });

      if (signal?.cancelled) {
        updateNode(node.id, { verificationStatus: "unverified", verificationErrors: "" });
        return "failed";
      }

      deductiveResult = result.valid ? "verified" : "failed";
    }

    // Run non-deductive artifact generation in parallel
    if (nonDeductiveTypes.length > 0) {
      const request: ArtifactGenerationRequest = { sourceText: nodeText, context, nodeId: node.id, nodeLabel: node.label };
      const artifactResults = await generateNonDeductiveArtifacts(nonDeductiveTypes, request, signal, customTypeDefs);

      if (signal?.cancelled) {
        updateNode(node.id, { verificationStatus: "unverified", verificationErrors: "" });
        return "failed";
      }

      // Store artifacts on the node
      const newArtifacts: NodeArtifact[] = artifactResults.map(({ type, content }) => ({
        type,
        content: typeof content === "string" ? content : JSON.stringify(content),
        verificationStatus: "unverified" as const,
        verificationErrors: "",
      }));

      if (newArtifacts.length > 0) {
        // Merge with existing artifacts, replacing any with the same type
        const existingArtifacts = (node.artifacts || []).filter(
          (a) => !newArtifacts.some((n) => n.type === a.type),
        );
        updateNode(node.id, { artifacts: [...existingArtifacts, ...newArtifacts] });
      }
    }

    // Final status: use deductive result if semiformal was selected, otherwise mark as verified
    // (non-deductive artifacts don't have a verification step yet)
    const finalStatus = hasSemiformal ? deductiveResult : "verified";
    updateNode(node.id, {
      verificationStatus: finalStatus,
      verificationErrors: "",
    });
    return finalStatus;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Request failed";
    updateNode(node.id, { verificationStatus: "failed", verificationErrors: msg });
    return "failed";
  }
}

/** Generate non-deductive artifacts by calling their API routes */
async function generateNonDeductiveArtifacts(
  types: ArtifactType[],
  request: ArtifactGenerationRequest,
  signal?: CancelSignal,
  customTypeDefs?: CustomArtifactTypeDefinition[],
): Promise<Array<{ type: ArtifactType; content: unknown }>> {
  // Index custom defs by id for O(1) lookup inside the per-type promise.
  // Mirrors useArtifactGeneration so single-node and batch paths agree.
  const customDefsById = new Map((customTypeDefs ?? []).map((d) => [d.id, d]));

  const promises = types.map(async (type): Promise<{ type: ArtifactType; content: unknown } | null> => {
    if (signal?.cancelled) return null;

    // Custom artifact types: dispatch to /api/formalization/custom with the
    // user's system prompt. Without a matching definition we skip silently —
    // the type was selected but its definition isn't in the workspace.
    if (isCustomType(type)) {
      const def = customDefsById.get(type);
      if (!def) return null;
      try {
        const data = await fetchApi<Record<string, unknown>>(
          "/api/formalization/custom",
          {
            ...request,
            customSystemPrompt: def.systemPrompt,
            customOutputFormat: def.outputFormat,
          },
        );
        return { type, content: data.result ?? null };
      } catch (err) {
        console.error(`[formalizeNode:${type}]`, err);
        return null;
      }
    }

    const builtinType = type as BuiltinArtifactType;
    const route = ARTIFACT_ROUTE[builtinType];
    if (!route) return null;

    try {
      const data = await fetchApi<Record<string, unknown>>(route, request);
      const key = ARTIFACT_RESPONSE_KEY[builtinType];
      return { type, content: data[key] ?? null };
    } catch (err) {
      console.error(`[formalizeNode:${type}]`, err);
      return null;
    }
  });

  const results = await Promise.all(promises);
  return results.filter((r): r is NonNullable<typeof r> => r != null && r.content != null);
}
