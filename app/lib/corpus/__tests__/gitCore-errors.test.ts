/**
 * gitCore typed-error mapping tests (DD-009 sub-task S3, G14-G15).
 *
 * Proves that remote-auth and merge-conflict failures reify to the EXISTING
 * typed CorpusErrorKinds (remote-auth-expired / git-conflict), never a generic
 * io error — the contract the S5 status UI keys on. No real network: auth is
 * driven by a fake http client that returns 401; the conflict is produced from a
 * real two-clone divergence merged locally (no remote needed).
 */

import { describe, it, expect } from "vitest";
import * as git from "isomorphic-git";
import { createGitCore } from "../gitCore";
import { createGitFs } from "../gitFs";
import { createInMemoryCorpusFs } from "./inMemoryCorpusFs";
import { CorpusError } from "../types";
import type { CorpusFS } from "../types";

const enc = (s: string) => new TextEncoder().encode(s);

/** A fake iso-git http client that always responds 401 (auth required). iso-git
 *  throws HttpError{data:{statusCode:401}} which gitCore maps to remote-auth-expired. */
const http401 = {
  async request() {
    return {
      url: "",
      method: "GET",
      headers: {},
      statusCode: 401,
      statusMessage: "Unauthorized",
      body: (async function* () {})(),
    };
  },
};

describe("gitCore error mapping", () => {
  it("push to a remote with bad auth rejects {kind:'remote-auth-expired'} (G14)", async () => {
    const corpus = createInMemoryCorpusFs();
    const core = createGitCore({
      fs: createGitFs(corpus, ""),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      http: http401 as any,
      dir: "",
      remoteUrl: "https://example.invalid/repo.git",
      author: { name: "t", email: "t@t" },
    });
    await core.init();
    await corpus.writeFile("a.md", enc("v1"));
    await core.commit("c1");

    await expect(core.push()).rejects.toSatisfy(
      (e: unknown) => e instanceof CorpusError && e.detail.kind === "remote-auth-expired",
    );
  });

  it("a cancelled auth also maps to remote-auth-expired (G14)", async () => {
    const corpus = createInMemoryCorpusFs();
    const core = createGitCore({
      fs: createGitFs(corpus, ""),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      http: http401 as any,
      dir: "",
      remoteUrl: "https://example.invalid/repo.git",
      onAuth: () => ({ cancel: true }),
      author: { name: "t", email: "t@t" },
    });
    await core.init();
    await corpus.writeFile("a.md", enc("v1"));
    await core.commit("c1");
    await expect(core.push()).rejects.toSatisfy(
      (e: unknown) => e instanceof CorpusError && e.detail.kind === "remote-auth-expired",
    );
  });

  it("push with no remote configured rejects a typed io error, not undefined (G14)", async () => {
    const corpus = createInMemoryCorpusFs();
    const core = createGitCore({ fs: createGitFs(corpus, ""), dir: "", author: { name: "t", email: "t@t" } });
    await core.init();
    await expect(core.push()).rejects.toBeInstanceOf(CorpusError);
  });

  it("a both-sides edit of the same file surfaces {kind:'git-conflict', path} (G15)", async () => {
    // Build a base repo, then two divergent commits to the same file, then merge
    // the divergent branch into the current one with abortOnConflict -> conflict.
    const corpus: CorpusFS = createInMemoryCorpusFs();
    const fs = createGitFs(corpus, "");
    const dir = "";
    const author = { name: "t", email: "t@t" };
    await git.init({ fs, dir, defaultBranch: "main" });

    // Base commit on main.
    await corpus.writeFile("shared.md", enc("line1\nline2\nline3\n"));
    await git.add({ fs, dir, filepath: "shared.md" });
    await git.commit({ fs, dir, message: "base", author });

    // Branch "other" diverges with an incompatible edit to line2.
    await git.branch({ fs, dir, ref: "other", checkout: false });
    await git.checkout({ fs, dir, ref: "other" });
    await corpus.writeFile("shared.md", enc("line1\nOTHER-edit\nline3\n"));
    await git.add({ fs, dir, filepath: "shared.md" });
    await git.commit({ fs, dir, message: "other-edit", author });

    // Back on main, an incompatible edit to the same line.
    await git.checkout({ fs, dir, ref: "main" });
    await corpus.writeFile("shared.md", enc("line1\nMAIN-edit\nline3\n"));
    await git.add({ fs, dir, filepath: "shared.md" });
    await git.commit({ fs, dir, message: "main-edit", author });

    // Merging "other" into main is a both-sides edit -> MergeConflictError, which
    // gitCore's mapGitError converts to {kind:"git-conflict", path}. We assert the
    // mapping by invoking the same merge path through the error mapper: merging
    // here throws the raw iso-git error; gitCore.pull() wraps the same code path.
    let caught: unknown;
    try {
      await git.merge({ fs, dir, theirs: "other", author, abortOnConflict: true });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    // The raw error is iso-git's MergeConflictError with the conflicted filepath;
    // gitCore.pull maps exactly this shape to git-conflict.
    expect((caught as { code?: string }).code).toBe("MergeConflictError");
    expect((caught as { data?: { filepaths?: string[] } }).data?.filepaths).toContain("shared.md");

    // Now prove gitCore's mapper turns that exact error into the typed kind.
    // (pull() runs git.pull which runs git.merge; we exercise the mapper directly
    // with the real error so the test doesn't need a remote.)
    const { mapGitErrorForTest } = await import("../gitCore");
    const mapped = mapGitErrorForTest(caught);
    expect(mapped).toBeInstanceOf(CorpusError);
    expect(mapped.detail.kind).toBe("git-conflict");
    expect(mapped.detail).toMatchObject({ path: "shared.md" });
  });
});
