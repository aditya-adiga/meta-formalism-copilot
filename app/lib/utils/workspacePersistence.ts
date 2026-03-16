import type { PropositionNode, NodeGroup, NodeVerificationStatus } from "@/app/lib/types/decomposition";
import type { PersistedWorkspace, PersistedDecomposition } from "@/app/lib/types/persistence";
import { WORKSPACE_VERSION, WORKSPACE_KEY } from "@/app/lib/types/persistence";

type VerificationStatus = "none" | "verifying" | "valid" | "invalid";

/** Strip transient "verifying" status back to "none" */
export function sanitizeVerificationStatus(status: string): "none" | "valid" | "invalid" {
  if (status === "valid" || status === "invalid") return status;
  return "none";
}

/** Strip transient "in-progress" node status back to "unverified" */
export function sanitizeNodeStatus(status: string): NodeVerificationStatus {
  if (status === "verified" || status === "failed" || status === "unverified") {
    return status;
  }
  return "unverified";
}

function sanitizeNode(node: PropositionNode): PropositionNode {
  return {
    ...node,
    verificationStatus: sanitizeNodeStatus(node.verificationStatus),
  };
}

/**
 * Save workspace state to localStorage.
 * Returns true on success, false on failure (e.g. QuotaExceededError).
 */
export function saveWorkspace(
  sourceText: string,
  extractedFiles: { name: string; text: string }[],
  contextText: string,
  semiformalText: string,
  leanCode: string,
  semiformalDirty: boolean,
  verificationStatus: VerificationStatus,
  verificationErrors: string,
  decomposition: PersistedDecomposition,
): boolean {
  const data: PersistedWorkspace = {
    version: WORKSPACE_VERSION,
    sourceText,
    extractedFiles,
    contextText,
    semiformalText,
    leanCode,
    semiformalDirty,
    verificationStatus: sanitizeVerificationStatus(verificationStatus),
    verificationErrors,
    decomposition: {
      ...decomposition,
      nodes: decomposition.nodes.map(sanitizeNode),
      groups: decomposition.groups ?? [],
    },
  };

  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function coerceDecomposition(raw: unknown): PersistedDecomposition {
  if (!isObject(raw)) {
    return { nodes: [], selectedNodeId: null, paperText: "" };
  }

  const nodes = Array.isArray(raw.nodes)
    ? (raw.nodes as unknown[]).filter(isObject).map((n) => ({
        id: typeof n.id === "string" ? n.id : "",
        label: typeof n.label === "string" ? n.label : "",
        kind: typeof n.kind === "string" ? n.kind : "proposition",
        statement: typeof n.statement === "string" ? n.statement : "",
        proofText: typeof n.proofText === "string" ? n.proofText : "",
        dependsOn: Array.isArray(n.dependsOn) ? (n.dependsOn as unknown[]).filter((d) => typeof d === "string") as string[] : [],
        semiformalProof: typeof n.semiformalProof === "string" ? n.semiformalProof : "",
        leanCode: typeof n.leanCode === "string" ? n.leanCode : "",
        verificationStatus: sanitizeNodeStatus(typeof n.verificationStatus === "string" ? n.verificationStatus : ""),
        verificationErrors: typeof n.verificationErrors === "string" ? n.verificationErrors : "",
      } as PropositionNode))
    : [];

  const groups: NodeGroup[] = Array.isArray(raw.groups)
    ? (raw.groups as unknown[]).filter(isObject).map((g) => ({
        id: typeof g.id === "string" ? g.id : "",
        name: typeof g.name === "string" ? g.name : "",
        nodeIds: Array.isArray(g.nodeIds) ? (g.nodeIds as unknown[]).filter((d) => typeof d === "string") as string[] : [],
        semiformalProof: typeof g.semiformalProof === "string" ? g.semiformalProof : "",
        leanCode: typeof g.leanCode === "string" ? g.leanCode : "",
        verificationStatus: sanitizeNodeStatus(typeof g.verificationStatus === "string" ? g.verificationStatus : ""),
        verificationErrors: typeof g.verificationErrors === "string" ? g.verificationErrors : "",
        context: typeof g.context === "string" ? g.context : "",
      } as NodeGroup))
    : [];

  return {
    nodes,
    selectedNodeId: typeof raw.selectedNodeId === "string" ? raw.selectedNodeId : null,
    paperText: typeof raw.paperText === "string" ? raw.paperText : "",
    groups,
  };
}

/**
 * Load workspace state from localStorage.
 * Returns null if no data, wrong version, or malformed.
 */
export function loadWorkspace(): PersistedWorkspace | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return null;
    if (parsed.version !== WORKSPACE_VERSION) return null;

    const decomposition = coerceDecomposition(parsed.decomposition);

    return {
      version: WORKSPACE_VERSION,
      sourceText: typeof parsed.sourceText === "string" ? parsed.sourceText : "",
      extractedFiles: Array.isArray(parsed.extractedFiles)
        ? (parsed.extractedFiles as unknown[])
            .filter(isObject)
            .map((f) => ({
              name: typeof f.name === "string" ? f.name : "",
              text: typeof f.text === "string" ? f.text : "",
            }))
        : [],
      contextText: typeof parsed.contextText === "string" ? parsed.contextText : "",
      semiformalText: typeof parsed.semiformalText === "string" ? parsed.semiformalText : "",
      leanCode: typeof parsed.leanCode === "string" ? parsed.leanCode : "",
      semiformalDirty: typeof parsed.semiformalDirty === "boolean" ? parsed.semiformalDirty : false,
      verificationStatus: sanitizeVerificationStatus(
        typeof parsed.verificationStatus === "string" ? parsed.verificationStatus : "",
      ),
      verificationErrors: typeof parsed.verificationErrors === "string" ? parsed.verificationErrors : "",
      decomposition,
    };
  } catch {
    return null;
  }
}
