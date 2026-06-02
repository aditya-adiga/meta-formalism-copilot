/** Layout path-builder + slug-sanitization tests (DD-009 S0, test-strategy G9/G10). */

import { describe, it, expect } from "vitest";
import {
  workspaceSlug,
  safeSegment,
  workspaceManifestPath,
  sourcePath,
  artifactVersionPath,
  artifactMetaPath,
  customTypePath,
  decompositionGraphLayoutPath,
} from "../layout";

describe("workspaceSlug sanitization (G10 — no traversal)", () => {
  it("strips path separators and dot-segments so a title can't escape workspaces/", () => {
    expect(workspaceSlug("../etc/passwd")).not.toContain("..");
    expect(workspaceSlug("../etc/passwd")).not.toContain("/");
    expect(workspaceSlug("a/b")).toBe("a-b");
    expect(workspaceSlug("My Workspace!")).toBe("my-workspace");
  });

  it("collapses unsafe runs and trims hyphens", () => {
    expect(workspaceSlug("  hello   world  ")).toBe("hello-world");
    expect(workspaceSlug("a***b")).toBe("a-b");
  });

  it("throws on an all-unsafe title rather than producing an empty slug", () => {
    // Diagnostic: a silent "" would let a workspace escape to workspaces/.
    expect(() => workspaceSlug("////")).toThrow(/empty slug/);
    expect(() => workspaceSlug("。。。")).toThrow(/empty slug/);
  });
});

describe("safeSegment", () => {
  it("keeps a normal custom-type id intact", () => {
    expect(safeSegment("custom-abc123")).toBe("custom-abc123");
  });
  it("neutralizes traversal in an id", () => {
    expect(safeSegment("../../secret")).not.toContain("..");
    expect(safeSegment("../../secret")).not.toContain("/");
  });
});

describe("path builders match DD-009 folder layout", () => {
  const s = "my-slug";
  it("manifest path", () => {
    expect(workspaceManifestPath(s)).toBe("workspaces/my-slug/workspace.json");
  });
  it("source path with extension", () => {
    expect(sourcePath(s, "src1", "pdf")).toBe("workspaces/my-slug/sources/src1.pdf");
    expect(sourcePath(s, "src1", ".PDF")).toBe("workspaces/my-slug/sources/src1.pdf");
  });
  it("artifact version path is zero-padded to 4 digits", () => {
    expect(artifactVersionPath(s, "semiformal", 1)).toBe("workspaces/my-slug/artifacts/semiformal/v0001.md");
    expect(artifactVersionPath(s, "causal-graph", 42)).toBe("workspaces/my-slug/artifacts/causal-graph/v0042.md");
  });
  it("rejects a non-positive or non-integer version", () => {
    expect(() => artifactVersionPath(s, "semiformal", 0)).toThrow();
    expect(() => artifactVersionPath(s, "semiformal", 1.5)).toThrow();
  });
  it("artifact meta, custom-type, decomposition paths", () => {
    expect(artifactMetaPath(s, "semiformal")).toBe("workspaces/my-slug/artifacts/semiformal/meta.json");
    expect(customTypePath(s, "custom-x")).toBe("workspaces/my-slug/custom-types/custom-x.json");
    expect(decompositionGraphLayoutPath(s)).toBe("workspaces/my-slug/decomposition/graph-layout.json");
  });
});
