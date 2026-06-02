/**
 * FSA folder-pick + permission + handle persistence (DD-009 sub-task S2).
 *
 * Wraps the user-gesture parts of the File System Access API so the rest of the
 * corpus layer never touches the browser API directly:
 *   - pickFolder(): showDirectoryPicker(), distinguishing user-cancel (AbortError
 *     -> resolves null, a no-op) from "API unavailable" (SSR / Firefox / Safari ->
 *     typed {kind:"unavailable"}). NEVER called at import/render time — only from a
 *     user gesture (a click handler), so it is SSR-safe.
 *   - ensurePermission(handle): queryPermission -> requestPermission, mapping a
 *     denied grant to {kind:"fsa-permission-revoked"} so the (S5) status UI can
 *     prompt a re-grant after a browser restart (DD-009 §Failure-driven; iso-git
 *     pre-mortem narrative #4).
 *   - saveHandle/loadHandle: persist the picked handle across reloads. A
 *     FileSystemDirectoryHandle is structured-cloneable, so IndexedDB can store it;
 *     the IDB get/set are INJECTED as functions (default uses a tiny IDB store) so
 *     tests can pass an in-memory map and CI never needs a real IndexedDB.
 *
 * This module is a pure function module by design (arch-review F3): it returns
 * handles/status and holds NO global "currently connected" singleton. The
 * composition root (storeAdapter) owns the wiring; the picker owns the mechanics.
 */

import { CorpusError } from "./types";

// --- Minimal local FSA permission typings (subset used here) ---
type PermissionState = "granted" | "denied" | "prompt";
interface FsaPermissionHandle {
  queryPermission?(opts?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(opts?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
}

type ShowDirectoryPicker = (opts?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;

function getPicker(): ShowDirectoryPicker | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { showDirectoryPicker?: ShowDirectoryPicker };
  return typeof w.showDirectoryPicker === "function" ? w.showDirectoryPicker.bind(window) : undefined;
}

/**
 * Prompt the user to pick a corpus folder. Resolves to the handle on success, or
 * `null` if the user cancelled (AbortError). Rejects with a typed CorpusError if
 * the API is unavailable (SSR / unsupported browser) — callers should treat that
 * as "stay OPFS-only" (DD-009 degraded mode).
 */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  const picker = getPicker();
  if (!picker) {
    throw new CorpusError({
      kind: "unavailable",
      reason: "showDirectoryPicker is not available (SSR or unsupported browser)",
    });
  }
  try {
    return await picker({ mode: "readwrite" });
  } catch (e) {
    // User dismissed the picker — not a failure, just "no folder connected".
    if (e instanceof DOMException && e.name === "AbortError") return null;
    if (e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError")) {
      throw new CorpusError({ kind: "fsa-permission-revoked" });
    }
    throw new CorpusError({ kind: "io", path: "(picker)", reason: (e as Error)?.message ?? String(e) });
  }
}

/**
 * Ensure read/write permission on a (possibly persisted) handle. Returns true if
 * granted; rejects {kind:"fsa-permission-revoked"} if denied. A "prompt" state
 * triggers requestPermission (must be called from a user gesture for a persisted
 * handle after reload). Handles without the permission API (older shapes) are
 * assumed granted — querying is best-effort.
 */
export async function ensurePermission(
  handle: FileSystemDirectoryHandle,
  mode: "read" | "readwrite" = "readwrite",
): Promise<true> {
  const h = handle as unknown as FsaPermissionHandle;
  let state: PermissionState = "granted";
  if (typeof h.queryPermission === "function") {
    state = await h.queryPermission({ mode });
  }
  if (state === "prompt" && typeof h.requestPermission === "function") {
    state = await h.requestPermission({ mode });
  }
  if (state === "granted") return true;
  throw new CorpusError({ kind: "fsa-permission-revoked" });
}

// --- Handle persistence (IndexedDB; get/set injected for testability) ---

const HANDLE_DB = "corpus-fsa";
const HANDLE_STORE = "handles";
const HANDLE_KEY = "corpus-root";

/** Pluggable persistence backend (default = IndexedDB). Tests pass an in-memory
 *  implementation so CI never needs a real IndexedDB. */
export interface HandleStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

function idbStore(): HandleStore {
  function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new CorpusError({ kind: "unavailable", reason: "indexedDB is not available" }));
        return;
      }
      const req = indexedDB.open(HANDLE_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(HANDLE_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return {
    async get(key) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE, "readonly");
        const r = tx.objectStore(HANDLE_STORE).get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    },
    async set(key, value) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE, "readwrite");
        tx.objectStore(HANDLE_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
  };
}

/** Persist the picked corpus-root handle so it survives a reload (permission must
 *  still be re-granted via ensurePermission on load — see module header). */
export async function saveHandle(handle: FileSystemDirectoryHandle, store: HandleStore = idbStore()): Promise<void> {
  await store.set(HANDLE_KEY, handle);
}

/** Load a previously-persisted corpus-root handle, or null if none. The caller
 *  MUST call ensurePermission before using it (the grant may not survive reload). */
export async function loadHandle(store: HandleStore = idbStore()): Promise<FileSystemDirectoryHandle | null> {
  const v = await store.get(HANDLE_KEY);
  return (v as FileSystemDirectoryHandle | undefined) ?? null;
}
