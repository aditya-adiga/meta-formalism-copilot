/**
 * Main-thread git proxy tests (DD-009 sub-task S3, G18-G20).
 *
 * The proxy is tested over a FAKE transport (jsdom has no Worker). It must:
 * reconstruct a typed CorpusError from a {ok:false} response and throw it,
 * resolve a {ok:true} response, and correlate concurrent requests by id so
 * responses never cross. Also asserts the interface-separation invariant (G20):
 * a CorpusFS fake carries NO git methods.
 */

import { describe, it, expect } from "vitest";
import { createGitWorkerProxy } from "../gitWorkerClient";
import type { GitTransport } from "../gitWorkerClient";
import type { GitRequest, GitResponse } from "../gitProtocol";
import { CorpusError, toWorkerError } from "../types";
import { createInMemoryCorpusFs } from "./inMemoryCorpusFs";

/** A controllable fake transport: records posted requests, lets the test push a
 *  response back to the proxy's listener. */
function fakeTransport() {
  let listener: ((res: GitResponse) => void) | null = null;
  const posted: GitRequest[] = [];
  const transport: GitTransport = {
    post(req) {
      posted.push(req);
    },
    onMessage(cb) {
      listener = cb;
      return () => {
        listener = null;
      };
    },
  };
  return {
    transport,
    posted,
    respond(res: GitResponse) {
      listener?.(res);
    },
  };
}

describe("createGitWorkerProxy (G18, G19)", () => {
  it("resolves a {ok:true} response with the result (G19)", async () => {
    const t = fakeTransport();
    const proxy = createGitWorkerProxy(t.transport);
    const p = proxy.commit("m");
    const id = t.posted[0].id;
    t.respond({ id, ok: true, result: { oid: "a".repeat(40), noChange: false } });
    await expect(p).resolves.toEqual({ oid: "a".repeat(40), noChange: false });
  });

  it("reconstructs a typed CorpusError from a {ok:false} response and throws it (G18)", async () => {
    const t = fakeTransport();
    const proxy = createGitWorkerProxy(t.transport);
    const p = proxy.pull();
    const id = t.posted[0].id;
    t.respond({ id, ok: false, error: toWorkerError(new CorpusError({ kind: "git-conflict", path: "x.md" })) });
    await expect(p).rejects.toSatisfy(
      (e: unknown) => e instanceof CorpusError && e.detail.kind === "git-conflict" && (e.detail as { path: string }).path === "x.md",
    );
  });

  it("maps a remote-auth-expired worker error back to the typed kind (G18)", async () => {
    const t = fakeTransport();
    const proxy = createGitWorkerProxy(t.transport);
    const p = proxy.push();
    const id = t.posted[0].id;
    t.respond({ id, ok: false, error: toWorkerError(new CorpusError({ kind: "remote-auth-expired" })) });
    await expect(p).rejects.toSatisfy(
      (e: unknown) => e instanceof CorpusError && e.detail.kind === "remote-auth-expired",
    );
  });

  it("correlates concurrent requests by id — responses never cross (G19)", async () => {
    const t = fakeTransport();
    const proxy = createGitWorkerProxy(t.transport);
    const pCommit = proxy.commit("m");
    const pStatus = proxy.status();
    expect(t.posted).toHaveLength(2);
    const [commitReq, statusReq] = t.posted;
    expect(commitReq.id).not.toBe(statusReq.id);

    // Respond out of order: status first, then commit.
    t.respond({ id: statusReq.id, ok: true, result: [{ path: "a.md", status: "added" }] });
    t.respond({ id: commitReq.id, ok: true, result: { oid: "b".repeat(40), noChange: false } });

    await expect(pStatus).resolves.toEqual([{ path: "a.md", status: "added" }]);
    await expect(pCommit).resolves.toEqual({ oid: "b".repeat(40), noChange: false });
  });

  it("ignores a response for an unknown/late id without crashing", () => {
    const t = fakeTransport();
    createGitWorkerProxy(t.transport);
    // No pending request with id 999 — must be a silent no-op, not a throw.
    expect(() => t.respond({ id: 999, ok: true, result: undefined })).not.toThrow();
  });
});

describe("CorpusGit is SEPARATE from CorpusFS (ISP, G20)", () => {
  it("a CorpusFS fake carries no git methods — non-git consumers don't stub git", () => {
    const fs = createInMemoryCorpusFs() as unknown as Record<string, unknown>;
    expect(typeof fs.commit).toBe("undefined");
    expect(typeof fs.log).toBe("undefined");
    expect(typeof fs.push).toBe("undefined");
    expect(typeof fs.pull).toBe("undefined");
    // It IS a full CorpusFS though.
    expect(typeof fs.readFile).toBe("function");
    expect(typeof fs.writeFile).toBe("function");
  });
});
