/**
 * iso-git fs shim tests (DD-009 sub-task S3, G1-G6).
 *
 * Verifies the shim presents iso-git's required fs.promises surface faithfully
 * over a 5-method CorpusFS: byte/utf8 round-trip, mkdir-as-no-op, file vs dir
 * stat, ENOENT throws on missing (iso-git branches on err.code), and idempotent
 * unlink/rmdir. The real-iso-git-over-the-shim run lives in gitCore.test.ts.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGitFs } from "../gitFs";
import { createInMemoryCorpusFs } from "./inMemoryCorpusFs";
import type { CorpusFS } from "../types";

describe("createGitFs (shim over CorpusFS)", () => {
  let fs: CorpusFS;
  let gitfs: ReturnType<typeof createGitFs>["promises"];

  beforeEach(() => {
    fs = createInMemoryCorpusFs();
    gitfs = createGitFs(fs).promises;
  });

  it("round-trips raw bytes (G1)", async () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 128]);
    await gitfs.writeFile(".git/x", bytes);
    const out = await gitfs.readFile(".git/x");
    expect(out).toBeInstanceOf(Uint8Array);
    expect(Array.from(out as Uint8Array)).toEqual(Array.from(bytes));
  });

  it("returns a string when readFile is given an encoding (G1)", async () => {
    await gitfs.writeFile(".git/HEAD", new TextEncoder().encode("ref: refs/heads/main\n"));
    const asStr = await gitfs.readFile(".git/HEAD", { encoding: "utf8" });
    expect(typeof asStr).toBe("string");
    expect(asStr).toBe("ref: refs/heads/main\n");
    // Also accepts the string-shorthand encoding form.
    expect(await gitfs.readFile(".git/HEAD", "utf8")).toBe("ref: refs/heads/main\n");
  });

  it("readdir lists immediate children (G2)", async () => {
    await gitfs.writeFile(".git/refs/heads/main", new TextEncoder().encode("abc"));
    await gitfs.writeFile(".git/refs/tags/v1", new TextEncoder().encode("def"));
    expect(await gitfs.readdir(".git/refs")).toEqual(["heads", "tags"]);
  });

  it("mkdir is a no-op and a nested write still works (G3)", async () => {
    await expect(gitfs.mkdir(".git/objects/ab")).resolves.toBeUndefined();
    // The dir didn't need to pre-exist; CorpusFS creates it implicitly on write.
    await gitfs.writeFile(".git/objects/ab/cdef", new TextEncoder().encode("obj"));
    expect(await gitfs.readdir(".git/objects/ab")).toEqual(["cdef"]);
  });

  it("stat on a file reports isFile + size; on a dir prefix reports isDirectory (G5)", async () => {
    await gitfs.writeFile(".git/config", new TextEncoder().encode("[core]"));
    const fileStat = await gitfs.stat(".git/config");
    expect(fileStat.isFile()).toBe(true);
    expect(fileStat.isDirectory()).toBe(false);
    expect(fileStat.size).toBe(6);

    const dirStat = await gitfs.stat(".git");
    expect(dirStat.isDirectory()).toBe(true);
    expect(dirStat.isFile()).toBe(false);
  });

  it("stat/lstat on a missing path throws ENOENT (G6)", async () => {
    await expect(gitfs.stat(".git/nope")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(gitfs.lstat(".git/also-nope")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("readFile on a missing path throws ENOENT (G6)", async () => {
    await expect(gitfs.readFile(".git/missing")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("unlink and rmdir are idempotent on missing paths (G4)", async () => {
    await expect(gitfs.unlink(".git/never")).resolves.toBeUndefined();
    await expect(gitfs.rmdir(".git/never-dir")).resolves.toBeUndefined();
    // unlink removes a real file.
    await gitfs.writeFile(".git/tmp", new TextEncoder().encode("x"));
    await gitfs.unlink(".git/tmp");
    await expect(gitfs.readFile(".git/tmp")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("strips a configured root prefix from absolute-looking paths", async () => {
    const rooted = createGitFs(fs, "corpus").promises;
    await rooted.writeFile("corpus/.git/HEAD", new TextEncoder().encode("ref"));
    // Stored at the CorpusFS-relative path (root stripped).
    expect(await fs.readFile(".git/HEAD")).not.toBeNull();
    expect(await rooted.readFile("corpus/.git/HEAD", "utf8")).toBe("ref");
  });
});
