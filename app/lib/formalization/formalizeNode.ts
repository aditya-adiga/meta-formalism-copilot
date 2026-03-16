import type { PropositionNode } from "@/app/lib/types/decomposition";
import { gatherDependencyContext } from "@/app/lib/utils/leanContext";
import { generateSemiformal, generateLean, verifyLean } from "@/app/lib/formalization/api";

const MAX_LEAN_ATTEMPTS = 3;

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
    let currentCode = "";
    let lastErrors = "";

    for (let attempt = 1; attempt <= MAX_LEAN_ATTEMPTS; attempt++) {
      if (signal?.cancelled) {
        updateNode(node.id, { verificationStatus: "unverified", verificationErrors: "" });
        return "failed";
      }

      currentCode = await generateLean(
        proof,
        attempt > 1 ? currentCode : undefined,
        attempt > 1 ? lastErrors : undefined,
        undefined,
        depContext || undefined,
      );
      updateNode(node.id, { leanCode: currentCode });

      if (signal?.cancelled) {
        updateNode(node.id, { verificationStatus: "unverified", verificationErrors: "" });
        return "failed";
      }

      const fullCode = depContext ? `${depContext}\n\n${currentCode}` : currentCode;
      const { valid, errors } = await verifyLean(fullCode);

      if (valid) {
        updateNode(node.id, { verificationStatus: "verified", verificationErrors: "" });
        return "verified";
      }

      lastErrors = errors || "Verification failed";
      updateNode(node.id, { verificationErrors: lastErrors });
      if (attempt === MAX_LEAN_ATTEMPTS) {
        updateNode(node.id, { verificationStatus: "failed" });
      }
    }

    return "failed";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Request failed";
    updateNode(node.id, { verificationStatus: "failed", verificationErrors: msg });
    return "failed";
  }
}
