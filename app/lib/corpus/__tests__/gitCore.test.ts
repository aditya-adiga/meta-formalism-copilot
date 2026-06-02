/**
 * gitCore tests against REAL isomorphic-git (DD-009 sub-task S3, G7-G13).
 *
 * vitest runs on Node, so we can exercise the actual git logic — init, commit,
 * paginated log, status — over the gitFs shim backed by an in-memory CorpusFS.
 * This is the substrate-parity run the arch review (F7) requires: real iso-git
 * over the same shim production will use. The real Worker + real OPFS + real
 * remote are NOT here (jsdom has no Worker/OPFS/network) — they are the smoke
 * (docs/spikes/corpus-git-smoke.md).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGitCore } from "../gitCore";
import { createGitFs } from "../gitFs";
import { createInMemoryCorpusFs } from "./inMemoryCorpusFs";
import type { CorpusGit, CorpusFS } from "../types";

const enc = (s: string) => new TextEncoder().encode(s);

describe("gitCore over the gitFs shim + in-memory CorpusFS (real iso-git)", () => {
  let corpus: CorpusFS;
  let core: CorpusGit;

  beforeEach(async () => {
    corpus = createInMemoryCorpusFs();
    core = createGitCore({ fs: createGitFs(corpus, ""), dir: "", author: { name: "t", email: "t@t" } });
    await core.init();
  });

  async function commitFile(path: string, content: string, message: string) {
    await corpus.writeFile(path, enc(content));
    return core.commit(message);
  }

  it("init then commit returns a 40-char sha (G7, G8)", async () => {
    const r = await commitFile("artifacts/semiformal/v0001.md", "v1", "first");
    expect(r.noChange).toBe(false);
    expect(r.oid).toHaveLength(40);
  });

  it("a second commit after a change returns a different sha (G8)", async () => {
    const r1 = await commitFile("a.md", "v1", "c1");
    const r2 = await commitFile("a.md", "v2", "c2");
    expect(r2.oid).not.toBe(r1.oid);
    expect(r2.noChange).toBe(false);
  });

  it("committing with no changes is a typed no-op (G9)", async () => {
    const r1 = await commitFile("a.md", "v1", "c1");
    const r2 = await core.commit("nothing changed");
    expect(r2.noChange).toBe(true);
    expect(r2.oid).toBe(r1.oid); // HEAD unchanged
  });

  it("log on an empty repo returns an empty history, not an error (G10)", async () => {
    const page = await core.log();
    expect(page.entries).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it("log({depth}) bounds the page and yields a cursor that paginates without repeats (G10, G11)", async () => {
    // 5 commits, each touching the same file.
    for (let v = 1; v <= 5; v++) await commitFile("a.md", `v${v}`, `c${v}`);

    const p1 = await core.log({ filepath: "a.md", depth: 2 });
    expect(p1.entries).toHaveLength(2);
    expect(p1.nextCursor).not.toBeNull();
    expect(p1.entries[0].message.trim()).toBe("c5"); // newest first

    const p2 = await core.log({ filepath: "a.md", depth: 2, cursor: p1.nextCursor! });
    expect(p2.entries).toHaveLength(2);
    // Page 2 must not repeat page 1's oids.
    const p1oids = new Set(p1.entries.map((e) => e.oid));
    for (const e of p2.entries) expect(p1oids.has(e.oid)).toBe(false);

    const p3 = await core.log({ filepath: "a.md", depth: 2, cursor: p2.nextCursor! });
    expect(p3.entries).toHaveLength(1); // the 5th commit
    expect(p3.nextCursor).toBeNull(); // history exhausted
  });

  it("log({filepath}) returns only commits touching that file (G12)", async () => {
    await commitFile("a.md", "a1", "touch-a");
    await commitFile("b.md", "b1", "touch-b");
    await commitFile("a.md", "a2", "touch-a-again");

    const aLog = await core.log({ filepath: "a.md", depth: 50 });
    const messages = aLog.entries.map((e) => e.message.trim());
    expect(messages).toContain("touch-a");
    expect(messages).toContain("touch-a-again");
    expect(messages).not.toContain("touch-b");
  });

  it("log entries carry oid + message + author (provenance) (G12)", async () => {
    await commitFile("a.md", "v1", "with-author");
    const page = await core.log({ depth: 1 });
    const e = page.entries[0];
    expect(e.oid).toHaveLength(40);
    expect(e.message.trim()).toBe("with-author");
    expect(e.author.name).toBe("t");
    expect(e.author.email).toBe("t@t");
    expect(typeof e.author.timestamp).toBe("number");
  });

  it("status reports added / modified / deleted vs HEAD (G13)", async () => {
    await commitFile("a.md", "short", "c1");
    await commitFile("c.md", "to-delete", "c2");

    // Add a new file, modify the existing one (different length -> detectable),
    // and delete another.
    await corpus.writeFile("b.md", enc("new"));
    await corpus.writeFile("a.md", enc("a much longer modified body"));
    await corpus.rm("c.md");
    const st = await core.status();
    const byPath = Object.fromEntries(st.map((s) => [s.path, s.status]));
    expect(byPath["b.md"]).toBe("added");
    expect(byPath["a.md"]).toBe("modified");
    expect(byPath["c.md"]).toBe("deleted");
  });

  // NOTE on status() fidelity: iso-git's statusMatrix uses a stat fast-path
  // (size + mtime) to decide whether to re-hash a file. The in-memory CorpusFS
  // fake reports mtime 0 for everything, so a same-byte-length content edit
  // ("v1" -> "v2") is NOT detected by status() over this fake. Real OPFS tracks
  // File.lastModified, so production status() detects it; commit() side-steps the
  // issue entirely by force re-adding (re-hashing) every file. This test uses a
  // different-length edit, which is detected via size regardless of mtime.
});
