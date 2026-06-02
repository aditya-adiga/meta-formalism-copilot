/**
 * Store-adapter selection tests for S2's third branch (DD-009 S2, G25).
 *
 * Verifies the new flag-ON + connected-folder arm routes through the mirror
 * composite, and that S1's two arms (flag OFF -> localStorage; flag ON/no-folder
 * -> bare OPFS) are unchanged. The flag is read from localStorage (S1 flag.ts);
 * OPFS/FSA are absent in jsdom, so we assert via injected fakes + a spy on which
 * CorpusFS receives the mirrored write rather than touching real OPFS.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveCorpusFs, resolveWorkspaceStorage } from "../storeAdapter";
import { createInMemoryCorpusFs } from "./inMemoryCorpusFs";
import type { MirrorCorpusFs } from "../mirrorFs";
import { CORPUS_FLAG_KEY } from "../flag";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("resolveCorpusFs (S2 third arm, G25)", () => {
  it("returns bare OPFS (no mirror status surface) when no folder is connected", () => {
    const fs = resolveCorpusFs(null) as Partial<MirrorCorpusFs>;
    // Bare OPFS adapter is a plain CorpusFS — it has no getMirrorStatus.
    expect(typeof fs.getMirrorStatus).toBe("undefined");
  });

  it("returns a mirror composite when a connected FSA CorpusFS is injected", async () => {
    const connected = createInMemoryCorpusFs();
    // Inject an in-memory primary too (jsdom has no OPFS).
    const primary = createInMemoryCorpusFs();
    const fs = resolveCorpusFs(connected, primary) as MirrorCorpusFs;
    // A mirror exposes the sync-ack surface.
    expect(typeof fs.getMirrorStatus).toBe("function");
    expect(fs.getMirrorStatus().state).toBe("idle");

    // A write routes to the injected mirror (eventually) — prove via the surface.
    await fs.writeFile("state/x.json", new TextEncoder().encode("{}"));
    // status moved off idle (pending or ok depending on microtask timing).
    expect(fs.getMirrorStatus().state).not.toBe("idle");
    // and the bytes reach the connected mirror.
    await new Promise((r) => setTimeout(r, 50));
    expect(await connected.readFile("state/x.json")).not.toBeNull();
  });
});

describe("resolveWorkspaceStorage selection (S1 parity preserved)", () => {
  it("flag OFF (default) -> synchronous localStorage adapter (S1 behavior)", () => {
    localStorage.setItem("k", "seed");
    const storage = resolveWorkspaceStorage();
    // getItem reads localStorage synchronously (returns a string, not a Promise) —
    // the structural witness that this is the localStorage arm, not the async
    // corpus-backed arm.
    const got = storage.getItem("k");
    expect(typeof got).toBe("string");
    expect(got).toBe("seed");
    // And setItem writes through (debounced) to localStorage.
    storage.setItem("k", "v");
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(localStorage.getItem("k")).toBe("v"); // debounced write landed
        resolve();
      }, 350); // past the 300ms debounce
    });
  });

  it("flag ON + no connected folder -> corpus-backed storage (bare OPFS, S1 behavior)", () => {
    localStorage.setItem(CORPUS_FLAG_KEY, "1");
    const storage = resolveWorkspaceStorage();
    // Corpus-backed storage's getItem is async (returns a Promise), unlike the
    // synchronous localStorage adapter — a structural witness of the OPFS arm.
    const result = storage.getItem("anything");
    expect(typeof (result as Promise<unknown>).then).toBe("function");
    // Swallow the OPFS-unavailable rejection from the bare getItem in jsdom.
    void (result as Promise<unknown>).catch(() => {});
  });

  it("flag ON + connected folder -> corpus-backed storage (not localStorage)", () => {
    // The mirror-routing itself is verified in the resolveCorpusFs test above with
    // an injected in-memory primary (jsdom has no OPFS). Here we only confirm that
    // passing a connected folder still selects the async corpus-backed storage arm
    // rather than the synchronous localStorage default.
    localStorage.setItem(CORPUS_FLAG_KEY, "1");
    const connected = createInMemoryCorpusFs();
    const storage = resolveWorkspaceStorage(connected);
    const result = storage.getItem("anything");
    expect(typeof (result as Promise<unknown>).then).toBe("function");
    // Swallow the OPFS-unavailable rejection from the bare getItem in jsdom.
    void (result as Promise<unknown>).catch(() => {});
  });
});
