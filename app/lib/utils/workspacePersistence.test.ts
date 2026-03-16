import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sanitizeVerificationStatus,
  sanitizeNodeStatus,
  saveWorkspace,
  loadWorkspace,
  migrateV1Workspace,
} from "./workspacePersistence";
import { WORKSPACE_KEY } from "@/app/lib/types/persistence";

const LEGACY_WORKSPACE_KEY = "workspace-v1";

// --- sanitizeVerificationStatus ---

describe("sanitizeVerificationStatus", () => {
  it("passes through 'valid'", () => {
    expect(sanitizeVerificationStatus("valid")).toBe("valid");
  });

  it("passes through 'invalid'", () => {
    expect(sanitizeVerificationStatus("invalid")).toBe("invalid");
  });

  it("passes through 'none'", () => {
    expect(sanitizeVerificationStatus("none")).toBe("none");
  });

  it("maps 'verifying' to 'none'", () => {
    expect(sanitizeVerificationStatus("verifying")).toBe("none");
  });

  it("maps unknown strings to 'none'", () => {
    expect(sanitizeVerificationStatus("garbage")).toBe("none");
  });
});

// --- sanitizeNodeStatus ---

describe("sanitizeNodeStatus", () => {
  it("passes through 'unverified'", () => {
    expect(sanitizeNodeStatus("unverified")).toBe("unverified");
  });

  it("passes through 'verified'", () => {
    expect(sanitizeNodeStatus("verified")).toBe("verified");
  });

  it("passes through 'failed'", () => {
    expect(sanitizeNodeStatus("failed")).toBe("failed");
  });

  it("maps 'in-progress' to 'unverified'", () => {
    expect(sanitizeNodeStatus("in-progress")).toBe("unverified");
  });

  it("maps unknown strings to 'unverified'", () => {
    expect(sanitizeNodeStatus("unknown")).toBe("unverified");
  });
});

// --- saveWorkspace ---

describe("saveWorkspace", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("writes JSON to localStorage and returns true", () => {
    const result = saveWorkspace({
      sourceText: "source", extractedFiles: [], contextText: "ctx",
      semiformalText: "semi", leanCode: "lean", semiformalDirty: false,
      verificationStatus: "valid", verificationErrors: "",
      decomposition: { nodes: [], selectedNodeId: null, paperText: "", sources: [] },
    });
    expect(result).toBe(true);
    const stored = JSON.parse(localStorage.getItem(WORKSPACE_KEY)!);
    expect(stored.version).toBe(2);
    expect(stored.sourceText).toBe("source");
    expect(stored.verificationStatus).toBe("valid");
  });

  it("sanitizes 'verifying' status to 'none'", () => {
    saveWorkspace({
      sourceText: "", extractedFiles: [], contextText: "",
      semiformalText: "", leanCode: "", semiformalDirty: false,
      verificationStatus: "verifying", verificationErrors: "",
      decomposition: { nodes: [], selectedNodeId: null, paperText: "", sources: [] },
    });
    const stored = JSON.parse(localStorage.getItem(WORKSPACE_KEY)!);
    expect(stored.verificationStatus).toBe("none");
  });

  it("sanitizes node 'in-progress' status to 'unverified'", () => {
    const node = {
      id: "1", label: "T1", kind: "theorem" as const,
      statement: "s", proofText: "p", dependsOn: [],
      sourceId: "", sourceLabel: "",
      semiformalProof: "", leanCode: "",
      verificationStatus: "in-progress" as const,
      verificationErrors: "",
      context: "", selectedArtifactTypes: [], artifacts: [],
    };
    saveWorkspace({
      sourceText: "", extractedFiles: [], contextText: "",
      semiformalText: "", leanCode: "", semiformalDirty: false,
      verificationStatus: "none", verificationErrors: "",
      decomposition: { nodes: [node], selectedNodeId: null, paperText: "", sources: [] },
    });
    const stored = JSON.parse(localStorage.getItem(WORKSPACE_KEY)!);
    expect(stored.decomposition.nodes[0].verificationStatus).toBe("unverified");
  });

  it("returns false on quota error", () => {
    const originalSetItem = localStorage.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    const result = saveWorkspace({
      sourceText: "", extractedFiles: [], contextText: "",
      semiformalText: "", leanCode: "", semiformalDirty: false,
      verificationStatus: "none", verificationErrors: "",
      decomposition: { nodes: [], selectedNodeId: null, paperText: "", sources: [] },
    });
    expect(result).toBe(false);
    Storage.prototype.setItem = originalSetItem;
  });
});

// --- loadWorkspace ---

describe("loadWorkspace", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when localStorage is empty", () => {
    expect(loadWorkspace()).toBeNull();
  });

  it("returns null for wrong version", () => {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ version: 999 }));
    expect(loadWorkspace()).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    localStorage.setItem(WORKSPACE_KEY, "not json{{{");
    expect(loadWorkspace()).toBeNull();
  });

  it("restores valid data correctly", () => {
    const data = {
      version: 2,
      sourceText: "hello",
      extractedFiles: [{ name: "f.txt", text: "content" }],
      contextText: "ctx",
      semiformalText: "semi",
      leanCode: "lean",
      semiformalDirty: true,
      verificationStatus: "valid",
      verificationErrors: "err",
      decomposition: {
        nodes: [{
          id: "1", label: "T1", kind: "theorem",
          statement: "s", proofText: "p", dependsOn: ["2"],
          semiformalProof: "sp", leanCode: "lc",
          verificationStatus: "verified",
          verificationErrors: "",
        }],
        selectedNodeId: "1",
        paperText: "paper",
      },
    };
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(data));

    const result = loadWorkspace()!;
    expect(result).not.toBeNull();
    expect(result.sourceText).toBe("hello");
    expect(result.extractedFiles).toEqual([{ name: "f.txt", text: "content" }]);
    expect(result.semiformalDirty).toBe(true);
    expect(result.verificationStatus).toBe("valid");
    expect(result.decomposition.nodes[0].verificationStatus).toBe("verified");
    expect(result.decomposition.selectedNodeId).toBe("1");
  });

  it("provides defaults for missing fields", () => {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ version: 2 }));
    const result = loadWorkspace()!;
    expect(result).not.toBeNull();
    expect(result.sourceText).toBe("");
    expect(result.extractedFiles).toEqual([]);
    expect(result.semiformalDirty).toBe(false);
    expect(result.verificationStatus).toBe("none");
    expect(result.decomposition.nodes).toEqual([]);
  });

  it("sanitizes 'verifying' to 'none' on load", () => {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({
      version: 2,
      verificationStatus: "verifying",
    }));
    const result = loadWorkspace()!;
    expect(result.verificationStatus).toBe("none");
  });

  it("sanitizes node 'in-progress' to 'unverified' on load", () => {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({
      version: 2,
      decomposition: {
        nodes: [{
          id: "1", label: "T1", kind: "theorem",
          statement: "", proofText: "", dependsOn: [],
          semiformalProof: "", leanCode: "",
          verificationStatus: "in-progress",
          verificationErrors: "",
        }],
        selectedNodeId: null,
        paperText: "",
      },
    }));
    const result = loadWorkspace()!;
    expect(result.decomposition.nodes[0].verificationStatus).toBe("unverified");
  });

  it("returns null for version 1 data (no longer accepted at v2 key)", () => {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ version: 1, sourceText: "old" }));
    expect(loadWorkspace()).toBeNull();
  });
});

// --- migrateV1Workspace ---

describe("migrateV1Workspace", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("migrates v1 data to v2 key when no v2 data exists", () => {
    localStorage.setItem(LEGACY_WORKSPACE_KEY, JSON.stringify({
      version: 1,
      sourceText: "migrated",
    }));

    migrateV1Workspace();

    expect(localStorage.getItem(LEGACY_WORKSPACE_KEY)).toBeNull();
    const stored = JSON.parse(localStorage.getItem(WORKSPACE_KEY)!);
    expect(stored.version).toBe(2);
    expect(stored.sourceText).toBe("migrated");
  });

  it("discards v1 data if v2 data already exists", () => {
    localStorage.setItem(LEGACY_WORKSPACE_KEY, JSON.stringify({ version: 1, sourceText: "old" }));
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ version: 2, sourceText: "current" }));

    migrateV1Workspace();

    expect(localStorage.getItem(LEGACY_WORKSPACE_KEY)).toBeNull();
    const stored = JSON.parse(localStorage.getItem(WORKSPACE_KEY)!);
    expect(stored.sourceText).toBe("current");
  });

  it("does nothing when no v1 data exists", () => {
    migrateV1Workspace();
    expect(localStorage.getItem(WORKSPACE_KEY)).toBeNull();
  });

  it("loadWorkspace integrates migration — v1 data becomes loadable", () => {
    localStorage.setItem(LEGACY_WORKSPACE_KEY, JSON.stringify({
      version: 1,
      sourceText: "from-v1",
      contextText: "ctx",
    }));

    const result = loadWorkspace()!;
    expect(result).not.toBeNull();
    expect(result.sourceText).toBe("from-v1");
    expect(result.contextText).toBe("ctx");
    expect(localStorage.getItem(LEGACY_WORKSPACE_KEY)).toBeNull();
  });
});
