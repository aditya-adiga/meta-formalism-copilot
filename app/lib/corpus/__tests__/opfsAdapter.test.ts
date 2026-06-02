/**
 * OPFS adapter error-mapping tests (DD-009 S1, test-strategy G7/G8).
 *
 * jsdom has no real OPFS, so these stub `navigator.storage` to drive the
 * adapter's error-reification logic. The adapter's *success* path is covered by
 * the shared CorpusFS contract suite run against real OPFS out-of-CI (Playwright,
 * step 9) — here we only assert that failures become typed CorpusErrors.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createOpfsCorpusFs } from "../opfsAdapter";
import { CorpusError } from "../types";

const original = Object.getOwnPropertyDescriptor(navigator, "storage");

function setStorage(value: unknown): void {
  Object.defineProperty(navigator, "storage", { configurable: true, value });
}

afterEach(() => {
  if (original) Object.defineProperty(navigator, "storage", original);
  else setStorage(undefined);
});

describe("OPFS adapter — unavailable guard (G8)", () => {
  it("rejects with a typed unavailable error when getDirectory is absent (SSR/unsupported)", async () => {
    setStorage({}); // storage present but no getDirectory
    const fs = createOpfsCorpusFs();
    let caught: unknown;
    try {
      await fs.readFile("x");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CorpusError);
    // Diagnostic: assert on the discriminated kind, not a string match.
    expect((caught as CorpusError).detail.kind).toBe("unavailable");
  });

  it("rejects unavailable for every method, not just readFile", async () => {
    setStorage(undefined);
    const fs = createOpfsCorpusFs();
    await expect(fs.writeFile("x", new Uint8Array())).rejects.toBeInstanceOf(CorpusError);
    await expect(fs.readdir("x")).rejects.toBeInstanceOf(CorpusError);
    await expect(fs.stat("x")).rejects.toBeInstanceOf(CorpusError);
    await expect(fs.rm("x")).rejects.toBeInstanceOf(CorpusError);
  });
});

describe("OPFS adapter — quota reification (G7)", () => {
  it("maps a QuotaExceededError on write to {kind:'quota-exceeded', substrate:'opfs'} (not swallowed)", async () => {
    const fakeRoot = {
      async getFileHandle() {
        return {
          async getFile() {
            return { size: 0, async arrayBuffer() { return new ArrayBuffer(0); } };
          },
          async createWritable() {
            throw new DOMException("quota", "QuotaExceededError");
          },
        };
      },
      async getDirectoryHandle() {
        return fakeRoot;
      },
      async removeEntry() {},
      async *keys() {},
    };
    setStorage({ getDirectory: async () => fakeRoot });

    const fs = createOpfsCorpusFs();
    let caught: unknown;
    try {
      await fs.writeFile("a.txt", new TextEncoder().encode("hi"));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CorpusError);
    const detail = (caught as CorpusError).detail;
    expect(detail.kind).toBe("quota-exceeded");
    if (detail.kind === "quota-exceeded") expect(detail.substrate).toBe("opfs");
  });
});

describe("OPFS adapter — defense-in-depth traversal rejection (C1)", () => {
  it("rejects a path containing a .. segment rather than resolving it", async () => {
    const fakeRoot = {
      async getFileHandle() { return { async getFile() { return { size: 0, async arrayBuffer() { return new ArrayBuffer(0); } }; }, async createWritable() { return { async write() {}, async close() {} }; } }; },
      async getDirectoryHandle() { return fakeRoot; },
      async removeEntry() {},
      async *keys() {},
    };
    setStorage({ getDirectory: async () => fakeRoot });
    const fs = createOpfsCorpusFs();
    let caught: unknown;
    try {
      await fs.writeFile("workspaces/s/../../escape.txt", new TextEncoder().encode("x"));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CorpusError);
    expect((caught as CorpusError).detail.kind).toBe("io");
  });
});
