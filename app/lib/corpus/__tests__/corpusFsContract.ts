/**
 * Shared `CorpusFS` contract suite (DD-009 sub-task S1).
 *
 * Any `CorpusFS` implementation must pass this. Run against the in-memory fake
 * in CI (corpusFs.contract.test.ts) and against the real OPFS adapter via
 * out-of-CI Playwright (jsdom has no OPFS). Keeping the cases in one place means
 * the fake and the adapter are held to identical behavior (substitutability).
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { CorpusFS } from "../types";

/** @param makeFs returns a fresh, empty CorpusFS for each test. */
export function defineCorpusFsContract(label: string, makeFs: () => CorpusFS | Promise<CorpusFS>): void {
  describe(`CorpusFS contract: ${label}`, () => {
    let fs: CorpusFS;
    beforeEach(async () => {
      fs = await makeFs();
    });

    it("returns null for a missing file (readFile) and missing stat", async () => {
      expect(await fs.readFile("absent.txt")).toBeNull();
      expect(await fs.stat("absent.txt")).toBeNull();
    });

    it("returns [] for a missing/empty directory (readdir)", async () => {
      expect(await fs.readdir("nope")).toEqual([]);
    });

    it("round-trips all 256 byte values exactly", async () => {
      const bytes = new Uint8Array(256);
      for (let i = 0; i < 256; i++) bytes[i] = i;
      await fs.writeFile("bin/all-bytes.dat", bytes);
      const out = await fs.readFile("bin/all-bytes.dat");
      expect(out).not.toBeNull();
      // Compare as arrays for a readable diff on failure.
      expect(Array.from(out!)).toEqual(Array.from(bytes));
      expect((await fs.stat("bin/all-bytes.dat"))?.size).toBe(256);
    });

    it("creates intermediate directories and lists children at each level", async () => {
      await fs.writeFile("workspaces/s/artifacts/semiformal/v0001.md", new TextEncoder().encode("x"));
      expect(await fs.readdir("workspaces")).toEqual(["s"]);
      expect(await fs.readdir("workspaces/s")).toEqual(["artifacts"]);
      expect(await fs.readdir("workspaces/s/artifacts")).toEqual(["semiformal"]);
      expect(await fs.readdir("workspaces/s/artifacts/semiformal")).toEqual(["v0001.md"]);
    });

    it("rm removes a file and is idempotent on a missing path", async () => {
      await fs.writeFile("a.txt", new TextEncoder().encode("hi"));
      await fs.rm("a.txt");
      expect(await fs.readFile("a.txt")).toBeNull();
      // Second rm (and rm of never-existed) must not throw.
      await expect(fs.rm("a.txt")).resolves.toBeUndefined();
      await expect(fs.rm("never-existed.txt")).resolves.toBeUndefined();
    });

    it("handles the S4 access pattern: 30 small files in one artifact dir (arch-review finding 4)", async () => {
      const dir = "workspaces/s/artifacts/semiformal";
      for (let v = 1; v <= 30; v++) {
        const name = `v${String(v).padStart(4, "0")}.md`;
        await fs.writeFile(`${dir}/${name}`, new TextEncoder().encode(`version ${v}`));
      }
      const names = await fs.readdir(dir);
      expect(names).toHaveLength(30);
      expect(names).toContain("v0001.md");
      expect(names).toContain("v0030.md");
      // Read each back and confirm content integrity.
      for (let v = 1; v <= 30; v++) {
        const name = `v${String(v).padStart(4, "0")}.md`;
        const bytes = await fs.readFile(`${dir}/${name}`);
        expect(new TextDecoder().decode(bytes!)).toBe(`version ${v}`);
      }
    });

    it("overwrites an existing file in place", async () => {
      await fs.writeFile("a.txt", new TextEncoder().encode("first"));
      await fs.writeFile("a.txt", new TextEncoder().encode("second"));
      expect(new TextDecoder().decode((await fs.readFile("a.txt"))!)).toBe("second");
    });
  });
}
