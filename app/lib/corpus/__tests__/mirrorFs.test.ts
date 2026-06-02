/**
 * Mirror composite behavior tests (DD-009 S2, test-strategy G11-G19).
 *
 * Two in-memory CorpusFS fakes stand in for OPFS (primary) and FSA (mirror). The
 * async mirror + backoff is driven with vi fake timers. The central invariant:
 * a mirror failure is SURFACED (status "failed" + ack + typed error), never
 * swallowed, while the primary write still succeeds (DD-009 §Failure-driven; the
 * surfacing half of S1 review C4; iso-git pre-mortem narrative #4).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMirrorCorpusFs, type MirrorStatus } from "../mirrorFs";
import { createInMemoryCorpusFs } from "./inMemoryCorpusFs";
import type { CorpusFS } from "../types";
import { CorpusError, type CorpusErrorKind } from "../types";

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array | null) => (b ? new TextDecoder().decode(b) : null);

/** Wrap a CorpusFS so its writeFile/rm fail a configurable number of times. */
function failingWrites(inner: CorpusFS, opts: { failTimes?: number; kind?: CorpusErrorKind }): CorpusFS {
  let remaining = opts.failTimes ?? Infinity;
  const err = () => new CorpusError(opts.kind ?? { kind: "io", path: "(mirror)", reason: "injected" });
  return {
    readFile: inner.readFile.bind(inner),
    readdir: inner.readdir.bind(inner),
    stat: inner.stat.bind(inner),
    async writeFile(path, bytes) {
      if (remaining > 0) {
        remaining -= 1;
        throw err();
      }
      return inner.writeFile(path, bytes);
    },
    async rm(path) {
      if (remaining > 0) {
        remaining -= 1;
        throw err();
      }
      return inner.rm(path);
    },
  };
}

/** Advance fake timers until no mirror op is in flight (flush the retry queue). */
async function flushMirror(getStatus: () => MirrorStatus): Promise<void> {
  // Run all pending microtasks + timers repeatedly until the queue drains.
  for (let i = 0; i < 20 && getStatus().inFlight > 0; i++) {
    await vi.advanceTimersByTimeAsync(1000);
  }
  // One more microtask flush for the final state transition.
  await Promise.resolve();
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("mirror — write path (G11, G12)", () => {
  it("writes to the primary synchronously and resolves without blocking on the mirror", async () => {
    const primary = createInMemoryCorpusFs();
    // Make the mirror's first attempt fail once so it is genuinely still in flight
    // (on backoff) when writeFile resolves — proving the primary write does not
    // wait for the mirror to complete.
    const mirror = failingWrites(createInMemoryCorpusFs(), { failTimes: 1 });
    const fs = createMirrorCorpusFs({ primary, mirror, backoffMs: [50, 100] });

    await fs.writeFile("a.txt", enc("hello"));
    // Primary has it immediately; mirror is still in flight (retry pending).
    expect(dec(await primary.readFile("a.txt"))).toBe("hello");
    expect(fs.getMirrorStatus().state).toBe("pending");
    expect(fs.getMirrorStatus().inFlight).toBe(1);

    await flushMirror(fs.getMirrorStatus);
    expect(fs.getMirrorStatus().state).toBe("ok");
    expect(dec(await mirror.readFile("a.txt"))).toBe("hello");
  });
});

describe("mirror — retry then succeed (G13)", () => {
  it("retries a failing mirror write with backoff and ends ok", async () => {
    const primary = createInMemoryCorpusFs();
    const mirror = failingWrites(createInMemoryCorpusFs(), { failTimes: 2 });
    const fs = createMirrorCorpusFs({ primary, mirror, backoffMs: [10, 20, 40] });

    await fs.writeFile("a.txt", enc("retry-me"));
    await flushMirror(fs.getMirrorStatus);

    expect(fs.getMirrorStatus().state).toBe("ok");
    expect(dec(await mirror.readFile("a.txt"))).toBe("retry-me");
  });
});

describe("mirror — exhaustion surfaces, never swallows (G14)", () => {
  it("ends 'failed' with a typed error and notifies the ack listener; primary write still succeeded", async () => {
    const primary = createInMemoryCorpusFs();
    const mirror = failingWrites(createInMemoryCorpusFs(), { failTimes: Infinity });
    const fs = createMirrorCorpusFs({ primary, mirror, backoffMs: [10, 20, 40] });

    const seen: MirrorStatus[] = [];
    fs.onMirror((s) => seen.push(s));

    await fs.writeFile("a.txt", enc("doomed"));
    await flushMirror(fs.getMirrorStatus);

    const status = fs.getMirrorStatus();
    expect(status.state).toBe("failed");
    expect(status.lastError).toBeInstanceOf(CorpusError);
    // Primary write still succeeded — the user is not blocked.
    expect(dec(await primary.readFile("a.txt"))).toBe("doomed");
    // The ack listener observed the failure (surfaced, not swallowed).
    expect(seen.some((s) => s.state === "failed")).toBe(true);
  });
});

describe("mirror — permission-revoked surfaces with its kind (G19)", () => {
  it("ends 'failed' carrying fsa-permission-revoked; primary unaffected", async () => {
    const primary = createInMemoryCorpusFs();
    const mirror = failingWrites(createInMemoryCorpusFs(), {
      failTimes: Infinity,
      kind: { kind: "fsa-permission-revoked" },
    });
    const fs = createMirrorCorpusFs({ primary, mirror, backoffMs: [10] });

    await fs.writeFile("a.txt", enc("x"));
    await flushMirror(fs.getMirrorStatus);

    const status = fs.getMirrorStatus();
    expect(status.state).toBe("failed");
    expect(status.lastError?.detail.kind).toBe("fsa-permission-revoked");
    expect(dec(await primary.readFile("a.txt"))).toBe("x");
  });
});

describe("mirror — read fallthrough (G15)", () => {
  it("returns the primary value when present, falls through to the mirror on a primary miss", async () => {
    const primary = createInMemoryCorpusFs();
    const mirror = createInMemoryCorpusFs();
    // Simulate a browser-storage clear: only the mirror has the file.
    await mirror.writeFile("recovered.txt", enc("from-folder"));
    const fs = createMirrorCorpusFs({ primary, mirror });

    expect(dec(await fs.readFile("recovered.txt"))).toBe("from-folder");
    expect((await fs.stat("recovered.txt"))?.size).toBe(enc("from-folder").byteLength);
    // Absent in both → null, never a throw.
    expect(await fs.readFile("nowhere.txt")).toBeNull();
    expect(await fs.stat("nowhere.txt")).toBeNull();
  });

  it("prefers the primary when both have the path", async () => {
    const primary = createInMemoryCorpusFs();
    const mirror = createInMemoryCorpusFs();
    await primary.writeFile("a.txt", enc("primary-wins"));
    await mirror.writeFile("a.txt", enc("stale-mirror"));
    const fs = createMirrorCorpusFs({ primary, mirror });
    expect(dec(await fs.readFile("a.txt"))).toBe("primary-wins");
  });
});

describe("mirror — no mirror configured behaves as bare primary (G16)", () => {
  it("all ops act on the primary only; status stays idle", async () => {
    const primary = createInMemoryCorpusFs();
    const fs = createMirrorCorpusFs({ primary, mirror: null });

    await fs.writeFile("a.txt", enc("solo"));
    expect(dec(await fs.readFile("a.txt"))).toBe("solo");
    expect(await fs.readdir("")).toEqual(["a.txt"]);
    await fs.rm("a.txt");
    expect(await fs.readFile("a.txt")).toBeNull();
    expect(fs.getMirrorStatus().state).toBe("idle");
  });
});

describe("mirror — readdir union/fallthrough (G17)", () => {
  it("returns the sorted union of primary and mirror child names", async () => {
    const primary = createInMemoryCorpusFs();
    const mirror = createInMemoryCorpusFs();
    await primary.writeFile("dir/b.txt", enc("b"));
    await mirror.writeFile("dir/a.txt", enc("a"));
    await mirror.writeFile("dir/b.txt", enc("b2")); // dedup
    const fs = createMirrorCorpusFs({ primary, mirror });
    expect(await fs.readdir("dir")).toEqual(["a.txt", "b.txt"]);
  });
});

describe("mirror — rm propagation (G18)", () => {
  it("removes from the primary and enqueues the rm to the mirror", async () => {
    const primary = createInMemoryCorpusFs();
    const mirror = createInMemoryCorpusFs();
    await primary.writeFile("a.txt", enc("x"));
    await mirror.writeFile("a.txt", enc("x"));
    const fs = createMirrorCorpusFs({ primary, mirror });

    await fs.rm("a.txt");
    expect(await primary.readFile("a.txt")).toBeNull();
    await flushMirror(fs.getMirrorStatus);
    expect(await mirror.readFile("a.txt")).toBeNull();
  });
});
