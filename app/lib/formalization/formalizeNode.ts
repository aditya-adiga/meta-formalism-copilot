import type { PropositionNode } from "@/app/lib/types/decomposition";
import { gatherDependencyContext } from "@/app/lib/utils/leanContext";
import { generateSemiformal } from "@/app/lib/formalization/api";
import { leanRetryLoop } from "@/app/lib/formalization/leanRetryLoop";

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
): Promise<"verified" | "failed"> {
  updateNode(node.id, { verificationStatus: "in-progress", verificationErrors: "" });

  try {
    const nodeText = `${node.statement}\n\n${node.proofText}`;

    // Step 1: semiformal proof
    const proof = await generateSemiformal(nodeText);
    if (signal?.cancelled) {
      updateNode(node.id, { verificationStatus: "unverified", verificationErrors: "" });
      return "failed";
    }
    updateNode(node.id, { semiformalProof: proof });

    // Step 2: Lean generation with dependency context + retry loop
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

    updateNode(node.id, {
      verificationStatus: result.valid ? "verified" : "failed",
      verificationErrors: result.errors,
    });
    return result.valid ? "verified" : "failed";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Request failed";
    updateNode(node.id, { verificationStatus: "failed", verificationErrors: msg });
    return "failed";
  }
}
