import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "path";
import { dataDir } from "./dataDir";

// Cheap unit test for an asymmetric deploy invariant: the Vercel branch
// of dataDir() is invisible in local dev, so a refactor that flips or
// deletes it would never be caught by lint/types/build. Pin both branches.
describe("dataDir", () => {
  const originalCwd = process.cwd();

  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns /tmp when VERCEL is set", () => {
    vi.stubEnv("VERCEL", "1");
    expect(dataDir()).toBe("/tmp");
  });

  it("treats any truthy VERCEL value as Vercel", () => {
    vi.stubEnv("VERCEL", "preview");
    expect(dataDir()).toBe("/tmp");
  });

  it("returns <cwd>/data when VERCEL is unset", () => {
    vi.stubEnv("VERCEL", "");
    expect(dataDir()).toBe(join(originalCwd, "data"));
  });
});
