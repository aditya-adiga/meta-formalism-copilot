/**
 * FSA adapter error-mapping tests (DD-009 S2, test-strategy G7-G10).
 *
 * jsdom has no real FSA. The success path is covered by the shared contract suite
 * over a fake handle (fsaAdapter.contract.test.ts); here we assert that every
 * failure becomes a typed CorpusError of the right kind — never a raw DOMException
 * and never swallowed (DD-009 §Failure-driven; iso-git pre-mortem narrative #4).
 */

import { describe, it, expect } from "vitest";
import { createFsaCorpusFs } from "../fsaAdapter";
import { makeFakeFsaHandle } from "./fakeFsaHandle";
import { CorpusError } from "../types";

async function catchErr(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return undefined;
  } catch (e) {
    return e;
  }
}

describe("FSA adapter — unavailable guard (G7)", () => {
  it("rejects with a typed unavailable error when no handle is provided (SSR/no folder connected)", async () => {
    const fs = createFsaCorpusFs(null);
    const caught = await catchErr(() => fs.readFile("x"));
    expect(caught).toBeInstanceOf(CorpusError);
    expect((caught as CorpusError).detail.kind).toBe("unavailable");
  });

  it("rejects unavailable for every method, not just readFile", async () => {
    const fs = createFsaCorpusFs(undefined);
    await expect(fs.writeFile("x", new Uint8Array())).rejects.toBeInstanceOf(CorpusError);
    await expect(fs.readdir("x")).rejects.toBeInstanceOf(CorpusError);
    await expect(fs.stat("x")).rejects.toBeInstanceOf(CorpusError);
    await expect(fs.rm("x")).rejects.toBeInstanceOf(CorpusError);
  });
});

describe("FSA adapter — permission-revoked mapping (G8)", () => {
  it("maps a NotAllowedError on write to {kind:'fsa-permission-revoked'} (not io, not swallowed)", async () => {
    const handle = makeFakeFsaHandle(new Map(), {
      onWrite: () => {
        throw new DOMException("permission revoked", "NotAllowedError");
      },
    });
    const fs = createFsaCorpusFs(handle);
    const caught = await catchErr(() => fs.writeFile("a.txt", new TextEncoder().encode("hi")));
    expect(caught).toBeInstanceOf(CorpusError);
    expect((caught as CorpusError).detail.kind).toBe("fsa-permission-revoked");
  });

  it("maps a SecurityError to {kind:'fsa-permission-revoked'} too", async () => {
    const handle = makeFakeFsaHandle(new Map(), {
      onGetFileHandleCreate: () => {
        throw new DOMException("insecure", "SecurityError");
      },
    });
    const fs = createFsaCorpusFs(handle);
    const caught = await catchErr(() => fs.writeFile("a.txt", new TextEncoder().encode("hi")));
    expect(caught).toBeInstanceOf(CorpusError);
    expect((caught as CorpusError).detail.kind).toBe("fsa-permission-revoked");
  });
});

describe("FSA adapter — quota reification (G9)", () => {
  it("maps a QuotaExceededError on write to {kind:'quota-exceeded', substrate:'fsa'}", async () => {
    const handle = makeFakeFsaHandle(new Map(), {
      onWrite: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    });
    const fs = createFsaCorpusFs(handle);
    const caught = await catchErr(() => fs.writeFile("a.txt", new TextEncoder().encode("hi")));
    expect(caught).toBeInstanceOf(CorpusError);
    const detail = (caught as CorpusError).detail;
    expect(detail.kind).toBe("quota-exceeded");
    if (detail.kind === "quota-exceeded") expect(detail.substrate).toBe("fsa");
  });
});

describe("FSA adapter — defense-in-depth traversal rejection (G10)", () => {
  it("rejects a path containing a .. segment rather than resolving it", async () => {
    const fs = createFsaCorpusFs(makeFakeFsaHandle());
    const caught = await catchErr(() =>
      fs.writeFile("workspaces/s/../../escape.txt", new TextEncoder().encode("x")),
    );
    expect(caught).toBeInstanceOf(CorpusError);
    expect((caught as CorpusError).detail.kind).toBe("io");
  });
});
