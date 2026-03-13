import type { PropositionNode } from "@/app/lib/types/decomposition";

/**
 * Gather verified Lean code from all transitive dependencies of a target node,
 * topologically sorted. Deduplicates `import Mathlib` lines.
 */
export function gatherDependencyContext(nodes: PropositionNode[], targetId: string): string {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Collect all transitive dependency IDs via DFS, with cycle detection
  const visited = new Set<string>();
  const order: string[] = [];

  function visit(id: string, path: Set<string>) {
    if (visited.has(id)) return;
    if (path.has(id)) return; // cycle — skip
    path.add(id);

    const node = nodeMap.get(id);
    if (!node) return;

    for (const depId of node.dependsOn) {
      visit(depId, path);
    }

    path.delete(id);
    visited.add(id);
    order.push(id);
  }

  // Visit dependencies of target (not the target itself)
  const target = nodeMap.get(targetId);
  if (!target) return "";

  for (const depId of target.dependsOn) {
    visit(depId, new Set<string>());
  }

  // Collect verified Lean code in topological order
  const codeBlocks: string[] = [];
  for (const id of order) {
    const node = nodeMap.get(id);
    if (node && node.verificationStatus === "verified" && node.leanCode.trim()) {
      codeBlocks.push(node.leanCode.trim());
    }
  }

  if (codeBlocks.length === 0) return "";

  // Join and deduplicate `import Mathlib` (keep only the first occurrence)
  const combined = codeBlocks.join("\n\n");
  const lines = combined.split("\n");
  let seenImport = false;
  const deduped = lines.filter((line) => {
    if (line.trim() === "import Mathlib") {
      if (seenImport) return false;
      seenImport = true;
    }
    return true;
  });

  return deduped.join("\n");
}
