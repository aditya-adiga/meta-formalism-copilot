import type { PropositionNode } from "@/app/lib/types/decomposition";
import { gatherDependencyContext } from "@/app/lib/utils/leanContext";

const MAX_LEAN_ATTEMPTS = 3;

/** Simple cancellation signal checked between async steps. */
export type CancelSignal = { cancelled: boolean };

async function generateLean(
  informalProof: string,
  previousAttempt?: string,
  errors?: string,
  instruction?: string,
  contextLeanCode?: string,
) {
  const res = await fetch("/api/formalization/lean", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ informalProof, previousAttempt, errors, instruction, contextLeanCode }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Lean generation failed");
  return data.leanCode as string;
}

async function verifyLean(leanCode: string) {
  const res = await fetch("/api/verification/lean", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leanCode }),
  });
  const data = await res.json();
  return { valid: Boolean(data.valid), errors: (data.errors as string | undefined) ?? "" };
}

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
    const semiformalRes = await fetch("/api/formalization/semiformal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: nodeText }),
    });
    if (signal?.cancelled) {
      updateNode(node.id, { verificationStatus: "unverified", verificationErrors: "" });
      return "failed";
    }

    const semiformalData = await semiformalRes.json();
    if (!semiformalRes.ok) {
      updateNode(node.id, { verificationStatus: "failed", verificationErrors: semiformalData.error ?? "Unknown error" });
      return "failed";
    }
    const proof = semiformalData.proof as string;
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
