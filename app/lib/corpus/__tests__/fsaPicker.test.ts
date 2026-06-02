/**
 * Folder-pick + permission + handle-persistence tests (DD-009 S2, G21-G24).
 *
 * jsdom has no showDirectoryPicker; we stub window.showDirectoryPicker to drive
 * pickFolder's branches, a fake handle with queryPermission/requestPermission for
 * ensurePermission, and an in-memory HandleStore for save/loadHandle (so CI never
 * needs a real IndexedDB). The central invariants: user-cancel is a no-op (null),
 * a denied grant maps to a typed fsa-permission-revoked, and the API-absent path
 * is a typed unavailable (never a raw TypeError).
 */

import { describe, it, expect, afterEach } from "vitest";
import { pickFolder, ensurePermission, saveHandle, loadHandle, type HandleStore } from "../fsaPicker";
import { CorpusError } from "../types";

const w = window as unknown as { showDirectoryPicker?: unknown };
const original = Object.getOwnPropertyDescriptor(window, "showDirectoryPicker");

function setPicker(value: unknown): void {
  Object.defineProperty(window, "showDirectoryPicker", { configurable: true, writable: true, value });
}

afterEach(() => {
  if (original) Object.defineProperty(window, "showDirectoryPicker", original);
  else delete w.showDirectoryPicker;
});

function inMemoryStore(seed: Record<string, unknown> = {}): HandleStore {
  const map = new Map<string, unknown>(Object.entries(seed));
  return {
    async get(key) {
      return map.get(key);
    },
    async set(key, value) {
      map.set(key, value);
    },
  };
}

describe("pickFolder (G21, G22)", () => {
  it("rejects with a typed unavailable error when showDirectoryPicker is absent", async () => {
    setPicker(undefined);
    let caught: unknown;
    try {
      await pickFolder();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CorpusError);
    expect((caught as CorpusError).detail.kind).toBe("unavailable");
  });

  it("resolves to null when the user cancels (AbortError) — a no-op, not a failure", async () => {
    setPicker(async () => {
      throw new DOMException("user aborted", "AbortError");
    });
    expect(await pickFolder()).toBeNull();
  });

  it("returns the handle on success", async () => {
    const fakeHandle = { name: "corpus" };
    setPicker(async () => fakeHandle);
    expect(await pickFolder()).toBe(fakeHandle);
  });
});

describe("ensurePermission (G23)", () => {
  it("returns true without prompting when already granted", async () => {
    let requested = 0;
    const handle = {
      async queryPermission() {
        return "granted";
      },
      async requestPermission() {
        requested += 1;
        return "granted";
      },
    } as unknown as FileSystemDirectoryHandle;
    expect(await ensurePermission(handle)).toBe(true);
    expect(requested).toBe(0);
  });

  it("requests permission when the state is 'prompt' and resolves on grant", async () => {
    let requested = 0;
    const handle = {
      async queryPermission() {
        return "prompt";
      },
      async requestPermission() {
        requested += 1;
        return "granted";
      },
    } as unknown as FileSystemDirectoryHandle;
    expect(await ensurePermission(handle)).toBe(true);
    expect(requested).toBe(1);
  });

  it("rejects fsa-permission-revoked when the request is denied", async () => {
    const handle = {
      async queryPermission() {
        return "prompt";
      },
      async requestPermission() {
        return "denied";
      },
    } as unknown as FileSystemDirectoryHandle;
    let caught: unknown;
    try {
      await ensurePermission(handle);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CorpusError);
    expect((caught as CorpusError).detail.kind).toBe("fsa-permission-revoked");
  });
});

describe("saveHandle / loadHandle (G24)", () => {
  it("round-trips a handle through the injected store", async () => {
    const store = inMemoryStore();
    const handle = { name: "corpus-root" } as unknown as FileSystemDirectoryHandle;
    await saveHandle(handle, store);
    expect(await loadHandle(store)).toBe(handle);
  });

  it("returns null when no handle is stored", async () => {
    expect(await loadHandle(inMemoryStore())).toBeNull();
  });
});
