/**
 * Git worker protocol reification tests (DD-009 sub-task S3, G16-G17).
 *
 * The contract that makes DD-009 §Failure-driven real: NOTHING untyped crosses
 * the worker postMessage boundary. handleGitRequest must (a) return the typed
 * {ok} discriminated response, (b) reify every throw — typed or not — via
 * toWorkerError into a structured-clone-safe payload, never rethrow.
 */

import { describe, it, expect } from "vitest";
import { handleGitRequest } from "../gitProtocol";
import type { GitRequest } from "../gitProtocol";
import { CorpusError, isCorpusWorkerError } from "../types";
import type { CorpusGit, CorpusErrorKind } from "../types";

/** A stub CorpusGit whose every method throws the supplied error. */
function throwingCore(err: unknown): CorpusGit {
  const t = async (): Promise<never> => {
    throw err;
  };
  return { init: t, commit: t, log: t, status: t, push: t, pull: t };
}

/** A stub CorpusGit that resolves with canned results. */
const okCore: CorpusGit = {
  async init() {},
  async commit() {
    return { oid: "a".repeat(40), noChange: false };
  },
  async log() {
    return { entries: [], nextCursor: null };
  },
  async status() {
    return [];
  },
  async push() {},
  async pull() {},
};

describe("handleGitRequest reification (G16, G17)", () => {
  it("returns {ok:true,result} for a successful request and echoes the id", async () => {
    const res = await handleGitRequest(okCore, { id: 7, type: "commit", message: "m" });
    expect(res).toEqual({ id: 7, ok: true, result: { oid: "a".repeat(40), noChange: false } });
  });

  it("a typed CorpusError is reified to a structured-clone-safe CorpusWorkerError (G16)", async () => {
    const res = await handleGitRequest(throwingCore(new CorpusError({ kind: "git-conflict", path: "x.md" })), {
      id: 1,
      type: "pull",
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(isCorpusWorkerError(res.error)).toBe(true);
    expect(res.error.detail).toEqual({ kind: "git-conflict", path: "x.md" });
    // Structured-clone safety: a JSON round-trip preserves the discriminated kind
    // (no class instances, no functions — postMessage uses structured clone).
    const cloned = JSON.parse(JSON.stringify(res.error));
    expect(cloned.detail.kind).toBe("git-conflict");
    expect(cloned.__corpusError).toBe(true);
  });

  it("preserves every CorpusErrorKind across reification (G16)", async () => {
    const kinds: CorpusErrorKind[] = [
      { kind: "not-found", path: "p" },
      { kind: "quota-exceeded", substrate: "remote" },
      { kind: "unavailable", reason: "r" },
      { kind: "io", path: "p", reason: "r" },
      { kind: "fsa-permission-revoked" },
      { kind: "remote-auth-expired" },
      { kind: "browser-storage-cleared" },
      { kind: "git-conflict", path: "p" },
    ];
    for (const detail of kinds) {
      const res = await handleGitRequest(throwingCore(new CorpusError(detail)), { id: 1, type: "status" });
      expect(res.ok).toBe(false);
      if (res.ok) continue;
      const cloned = JSON.parse(JSON.stringify(res.error));
      expect(cloned.detail).toEqual(detail);
    }
  });

  it("an UNTYPED throw is wrapped to {kind:'io'}, never rethrown (G17)", async () => {
    const res = await handleGitRequest(throwingCore(new Error("boom")), { id: 3, type: "push" });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error.detail.kind).toBe("io");
    expect(res.error.message).toContain("boom");
  });

  it("a non-Error throw (string) is still reified, not rethrown (G17)", async () => {
    const res = await handleGitRequest(throwingCore("plain string failure"), { id: 4, type: "init" });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error.detail.kind).toBe("io");
  });

  it("an unknown request type is a typed io failure, not a silent no-op", async () => {
    // Force an out-of-union request to exercise the exhaustiveness default arm.
    const bad = { id: 9, type: "frobnicate" } as unknown as GitRequest;
    const res = await handleGitRequest(okCore, bad);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error.detail.kind).toBe("io");
  });
});
