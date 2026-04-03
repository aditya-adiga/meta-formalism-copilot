import type { PropositionNode, NodeVerificationStatus } from "@/app/lib/types/decomposition";
import type { VerificationStatus } from "@/app/lib/types/session";
import type { PersistedWorkspace, PersistedDecomposition } from "@/app/lib/types/persistence";
import { WORKSPACE_VERSION, WORKSPACE_KEY } from "@/app/lib/types/persistence";

const LEGACY_WORKSPACE_KEY = "workspace-v1";

/** Migrate legacy workspace-v1 data to workspace-v2 key, then remove the old key. */
export function migrateV1Workspace(): void {
  try {
    const raw = localStorage.getItem(LEGACY_WORKSPACE_KEY);
    if (!raw) return;

    // Only migrate if there's no v2 data yet
    if (localStorage.getItem(WORKSPACE_KEY)) {
      localStorage.removeItem(LEGACY_WORKSPACE_KEY);
      return;
    }

    const parsed: unknown = JSON.parse(raw);
    if (isObject(parsed)) {
      // Stamp with current version so loadWorkspace accepts it
      (parsed as Record<string, unknown>).version = WORKSPACE_VERSION;
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify(parsed));
    }
    localStorage.removeItem(LEGACY_WORKSPACE_KEY);
  } catch {
    // Best-effort; don't block app startup
    try { localStorage.removeItem(LEGACY_WORKSPACE_KEY); } catch { /* ignore */ }
  }
}

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
export type ArtifactPersistenceData = {
  causalGraph: string | null;
  statisticalModel: string | null;
  propertyTests: string | null;
  balancedPerspectives: string | null;
  counterexamples: string | null;
};

export type SaveWorkspaceInput = {
  sourceText: string;
  extractedFiles: { name: string; text: string }[];
  contextText: string;
  semiformalText: string;
  leanCode: string;
  semiformalDirty: boolean;
  verificationStatus: VerificationStatus;
  verificationErrors: string;
  decomposition: PersistedDecomposition;
  artifacts?: ArtifactPersistenceData;
};

export function saveWorkspace(input: SaveWorkspaceInput): boolean {
  const artifacts = input.artifacts ?? { causalGraph: null, statisticalModel: null, propertyTests: null, balancedPerspectives: null, counterexamples: null };
  const data: PersistedWorkspace = {
    version: WORKSPACE_VERSION,
    sourceText: input.sourceText,
    extractedFiles: input.extractedFiles,
    contextText: input.contextText,
    semiformalText: input.semiformalText,
    leanCode: input.leanCode,
    semiformalDirty: input.semiformalDirty,
    verificationStatus: sanitizeVerificationStatus(input.verificationStatus),
    verificationErrors: input.verificationErrors,
    decomposition: {
      ...input.decomposition,
      nodes: input.decomposition.nodes.map(sanitizeNode),
    },
    causalGraph: artifacts.causalGraph,
    statisticalModel: artifacts.statisticalModel,
    propertyTests: artifacts.propertyTests,
    balancedPerspectives: artifacts.balancedPerspectives,
    counterexamples: artifacts.counterexamples,
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

export function coerceDecomposition(raw: unknown): PersistedDecomposition {
  if (!isObject(raw)) {
    return { nodes: [], selectedNodeId: null, paperText: "", sources: [] };
  }

  const nodes = Array.isArray(raw.nodes)
    ? (raw.nodes as unknown[]).filter(isObject).map((n) => ({
        id: typeof n.id === "string" ? n.id : "",
        label: typeof n.label === "string" ? n.label : "",
        kind: typeof n.kind === "string" ? n.kind : "proposition",
        statement: typeof n.statement === "string" ? n.statement : "",
        proofText: typeof n.proofText === "string" ? n.proofText : "",
        dependsOn: Array.isArray(n.dependsOn) ? (n.dependsOn as unknown[]).filter((d) => typeof d === "string") as string[] : [],
        sourceId: typeof n.sourceId === "string" ? n.sourceId : "",
        sourceLabel: typeof n.sourceLabel === "string" ? n.sourceLabel : "",
        semiformalProof: typeof n.semiformalProof === "string" ? n.semiformalProof : "",
        leanCode: typeof n.leanCode === "string" ? n.leanCode : "",
        verificationStatus: sanitizeNodeStatus(typeof n.verificationStatus === "string" ? n.verificationStatus : ""),
        verificationErrors: typeof n.verificationErrors === "string" ? n.verificationErrors : "",
        context: typeof n.context === "string" ? n.context : "",
        selectedArtifactTypes: Array.isArray(n.selectedArtifactTypes) ? n.selectedArtifactTypes as import("@/app/lib/types/session").ArtifactType[] : [],
        artifacts: Array.isArray(n.artifacts) ? n.artifacts as import("@/app/lib/types/decomposition").NodeArtifact[] : [],
      } as PropositionNode))
    : [];

  return {
    nodes,
    selectedNodeId: typeof raw.selectedNodeId === "string" ? raw.selectedNodeId : null,
    paperText: typeof raw.paperText === "string" ? raw.paperText : "",
    sources: Array.isArray(raw.sources) ? (raw.sources as unknown[]).filter(isObject).map((s) => ({
      sourceId: typeof s.sourceId === "string" ? s.sourceId : "",
      sourceLabel: typeof s.sourceLabel === "string" ? s.sourceLabel : "",
      text: typeof s.text === "string" ? s.text : "",
    })) : [],
  };
}

/**
 * Load workspace state from localStorage.
 * Returns null if no data, wrong version, or malformed.
 */
export function loadWorkspace(): PersistedWorkspace | null {
  try {
    migrateV1Workspace();
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
      causalGraph: typeof parsed.causalGraph === "string" ? parsed.causalGraph : null,
      statisticalModel: typeof parsed.statisticalModel === "string" ? parsed.statisticalModel : null,
      propertyTests: typeof parsed.propertyTests === "string" ? parsed.propertyTests : null,
      balancedPerspectives: typeof parsed.balancedPerspectives === "string" ? parsed.balancedPerspectives : (typeof parsed.dialecticalMap === "string" ? parsed.dialecticalMap : null),
      counterexamples: typeof parsed.counterexamples === "string" ? parsed.counterexamples : null,
    };
  } catch {
    return null;
  }
}
