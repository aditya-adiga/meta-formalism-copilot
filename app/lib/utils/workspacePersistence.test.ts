import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sanitizeVerificationStatus,
  sanitizeNodeStatus,
  saveWorkspace,
  loadWorkspace,
  migrateV1Workspace,
  isValidCustomTypeDef,
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

  it("maps 'unavailable' to 'none' (transient verifier-state, not artifact-state)", () => {
    expect(sanitizeVerificationStatus("unavailable")).toBe("none");
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

// --- isValidCustomTypeDef ---

describe("isValidCustomTypeDef", () => {
  const validDef = {
    id: "custom-abc123",
    name: "Test Type",
    chipLabel: "Test",
    description: "A test type",
    whenToUse: "When testing",
    systemPrompt: "You are a test analyzer.",
    outputFormat: "json",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("returns true for a valid definition", () => {
    expect(isValidCustomTypeDef(validDef)).toBe(true);
  });

  it("returns true for text outputFormat", () => {
    expect(isValidCustomTypeDef({ ...validDef, outputFormat: "text" })).toBe(true);
  });

  it("returns false for non-objects", () => {
    expect(isValidCustomTypeDef(null)).toBe(false);
    expect(isValidCustomTypeDef("string")).toBe(false);
    expect(isValidCustomTypeDef(42)).toBe(false);
    expect(isValidCustomTypeDef([])).toBe(false);
  });

  it("returns false when id does not start with 'custom-'", () => {
    expect(isValidCustomTypeDef({ ...validDef, id: "not-custom" })).toBe(false);
    expect(isValidCustomTypeDef({ ...validDef, id: "" })).toBe(false);
  });

  it("returns false when name is missing or empty", () => {
    expect(isValidCustomTypeDef({ ...validDef, name: "" })).toBe(false);
    expect(isValidCustomTypeDef({ ...validDef, name: 123 })).toBe(false);
  });

  it("returns false when chipLabel is missing or empty", () => {
    expect(isValidCustomTypeDef({ ...validDef, chipLabel: "" })).toBe(false);
    expect(isValidCustomTypeDef({ ...validDef, chipLabel: undefined })).toBe(false);
    expect(isValidCustomTypeDef({ ...validDef, chipLabel: 42 })).toBe(false);
  });

  it("returns false when systemPrompt is missing or empty", () => {
    expect(isValidCustomTypeDef({ ...validDef, systemPrompt: "" })).toBe(false);
    expect(isValidCustomTypeDef({ ...validDef, systemPrompt: undefined })).toBe(false);
  });

  it("returns false when outputFormat is invalid", () => {
    expect(isValidCustomTypeDef({ ...validDef, outputFormat: "xml" })).toBe(false);
    expect(isValidCustomTypeDef({ ...validDef, outputFormat: undefined })).toBe(false);
  });
});

// --- Custom artifact data persistence ---

describe("custom artifact type persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips custom type definitions through save/load", () => {
    const customType = {
      id: "custom-test1" as const,
      name: "Test Type",
      chipLabel: "Test",
      description: "desc",
      whenToUse: "when",
      systemPrompt: "prompt",
      outputFormat: "json" as const,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };

    saveWorkspace({
      sourceText: "", extractedFiles: [], contextText: "",
      semiformalText: "", leanCode: "", semiformalDirty: false,
      verificationStatus: "none", verificationErrors: "",
      decomposition: { nodes: [], selectedNodeId: null, paperText: "", sources: [] },
      customArtifactTypes: [customType],
      artifacts: { causalGraph: null, statisticalModel: null, propertyTests: null, dialecticalMap: null, counterexamples: null, customArtifactData: { "custom-test1": '{"result":"ok"}' } },
    });

    const result = loadWorkspace()!;
    expect(result).not.toBeNull();
    expect(result.customArtifactTypes).toHaveLength(1);
    expect(result.customArtifactTypes![0].id).toBe("custom-test1");
    expect(result.customArtifactTypes![0].name).toBe("Test Type");
    expect(result.customArtifactData!["custom-test1"]).toBe('{"result":"ok"}');
  });

  it("loads correctly when custom fields are missing (backward compat)", () => {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ version: 2 }));
    const result = loadWorkspace()!;
    expect(result.customArtifactTypes).toEqual([]);
    expect(result.customArtifactData).toEqual({});
  });

  it("filters out invalid custom type definitions on load", () => {
    const data = {
      version: 2,
      customArtifactTypes: [
        { id: "custom-good", name: "Good", chipLabel: "Good", systemPrompt: "prompt", outputFormat: "json" },
        { id: "bad-id", name: "Bad", systemPrompt: "prompt", outputFormat: "json" },
        { id: "custom-noname", name: "", systemPrompt: "prompt", outputFormat: "json" },
        "not-an-object",
      ],
    };
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(data));
    const result = loadWorkspace()!;
    expect(result.customArtifactTypes).toHaveLength(1);
    expect(result.customArtifactTypes![0].id).toBe("custom-good");
  });
});
