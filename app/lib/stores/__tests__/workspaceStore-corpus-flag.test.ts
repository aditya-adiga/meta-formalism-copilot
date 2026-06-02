/**
 * Storage-seam flag routing (DD-009 S1, test-strategy G13/G14/G15).
 *
 * Verifies the OFF default is unchanged (localStorage, OPFS never touched) and
 * that the CorpusFS-backed storage routes through the injected CorpusFS rather
 * than localStorage. Uses the in-memory fake so no real OPFS is needed.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import {
  resolveWorkspaceStorage,
  createCorpusBackedStorage,
} from "@/app/lib/corpus/storeAdapter";
import { CORPUS_FLAG_KEY } from "@/app/lib/corpus/flag";
import { createInMemoryCorpusFs } from "@/app/lib/corpus/__tests__/inMemoryCorpusFs";

const originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");

afterEach(() => {
  localStorage.clear();
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
});

describe("flag OFF (default) — localStorage, OPFS never touched (G13)", () => {
  it("routes writes to localStorage and never calls navigator.storage.getDirectory", () => {
    const getDirectory = vi.fn();
    Object.defineProperty(navigator, "storage", { configurable: true, value: { getDirectory } });

    vi.useFakeTimers(); // install before setItem so the debounce uses fake timers
    const storage = resolveWorkspaceStorage();
    storage.setItem("workspace-zustand-v1", '{"state":{"sourceText":"x"},"version":0}');
    vi.advanceTimersByTime(300); // flush debounced localStorage write
    vi.useRealTimers();

    expect(localStorage.getItem("workspace-zustand-v1")).toContain('"sourceText":"x"');
    expect(getDirectory).not.toHaveBeenCalled();
  });
});

describe("CorpusFS-backed storage routes through the injected CorpusFS (G14)", () => {
  it("writes/reads bytes via CorpusFS, not localStorage", async () => {
    const fs = createInMemoryCorpusFs();
    const storage = createCorpusBackedStorage(fs);

    await storage.setItem("workspace-zustand-v1", '{"hello":"corpus"}');
    // Not in localStorage:
    expect(localStorage.getItem("workspace-zustand-v1")).toBeNull();
    // Present in the corpus FS at the state/ path:
    const bytes = await fs.readFile("state/workspace-zustand-v1.json");
    expect(new TextDecoder().decode(bytes!)).toBe('{"hello":"corpus"}');
    // getItem round-trips:
    expect(await storage.getItem("workspace-zustand-v1")).toBe('{"hello":"corpus"}');
    // removeItem is idempotent and clears it:
    await storage.removeItem("workspace-zustand-v1");
    expect(await storage.getItem("workspace-zustand-v1")).toBeNull();
    await expect(storage.removeItem("workspace-zustand-v1")).resolves.toBeUndefined();
  });
});

describe("flag ON — resolver selects the OPFS-backed path (G15 wiring)", () => {
  it("routes to navigator.storage.getDirectory when the dev flag is set", async () => {
    localStorage.setItem(CORPUS_FLAG_KEY, "1");
    const fakeRoot = {
      async getFileHandle() {
        return {
          async getFile() { return { size: 0, async arrayBuffer() { return new ArrayBuffer(0); } }; },
          async createWritable() { return { async write() {}, async close() {} }; },
        };
      },
      async getDirectoryHandle() { return fakeRoot; },
      async removeEntry() {},
      async *keys() {},
    };
    const getDirectory = vi.fn(async () => fakeRoot);
    Object.defineProperty(navigator, "storage", { configurable: true, value: { getDirectory } });

    const storage = resolveWorkspaceStorage();
    await storage.setItem("workspace-zustand-v1", "{}");

    expect(getDirectory).toHaveBeenCalled();
    expect(localStorage.getItem("workspace-zustand-v1")).toBeNull(); // not the localStorage path
  });
});
