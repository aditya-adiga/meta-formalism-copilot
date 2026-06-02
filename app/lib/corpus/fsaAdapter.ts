/**
 * FSA-backed `CorpusFS` adapter (DD-009 sub-task S2).
 *
 * Implements the corpus filesystem over the File System Access API, using a
 * `FileSystemDirectoryHandle` that the user picked via `showDirectoryPicker()`
 * (see fsaPicker.ts). This is the opt-in, user-visible *source of truth* on disk;
 * the OPFS adapter (S1) is the always-on cache. The mirror composite (mirrorFs.ts)
 * is what wires OPFS→FSA together — this adapter is just the FSA leaf.
 *
 * Structurally a near-twin of opfsAdapter.ts. Two deltas:
 *   - The root is the *passed-in* handle, not `navigator.storage.getDirectory()`.
 *     A missing/invalid handle (or SSR) rejects with a typed {kind:"unavailable"}.
 *   - FSA can lose its permission grant across reloads; permission-class
 *     DOMExceptions (NotAllowedError / SecurityError) map to
 *     {kind:"fsa-permission-revoked"} so the (S5) status UI can prompt a re-grant,
 *     rather than being lost in a generic io error (DD-009 §Failure-driven; the
 *     iso-git pre-mortem narrative #4).
 *
 * FSA handle types are declared locally rather than relying on lib.dom, whose FSA
 * surface (notably `values()`/`keys()` and the writable's BufferSource strictness)
 * varies by TypeScript version — keeping our own minimal shapes makes the build
 * stable across upgrades, exactly as opfsAdapter.ts does for OPFS.
 */

import type { CorpusFS, CorpusStat } from "./types";
import { CorpusError } from "./types";

// --- Minimal local FSA typings (the subset this adapter uses) ---
interface FsaWritable {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}
interface FsaFileHandle {
  getFile(): Promise<{ size: number; arrayBuffer(): Promise<ArrayBuffer> }>;
  createWritable(): Promise<FsaWritable>;
}
export interface FsaDirHandle {
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FsaFileHandle>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FsaDirHandle>;
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>;
  /** FSA exposes async-iterable `keys()` (names only) on a directory handle. */
  keys(): AsyncIterableIterator<string>;
}

function isNotFound(e: unknown): boolean {
  return e instanceof DOMException && (e.name === "NotFoundError" || e.name === "TypeMismatchError");
}
function isQuota(e: unknown): boolean {
  return e instanceof DOMException && (e.name === "QuotaExceededError" || e.name === "QUOTA_EXCEEDED_ERR");
}
/** Permission loss surfaces as NotAllowedError (revoked grant) or SecurityError
 *  (e.g. cross-origin / insecure context). Both mean "the folder is no longer
 *  writable/readable" — the S5 status UI must prompt a re-grant. */
function isPermissionLost(e: unknown): boolean {
  return e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
}

function splitPath(path: string): { dirs: string[]; name: string } {
  const parts = path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  // Defense-in-depth: paths.ts is the sanitizing choke point, but the adapter
  // must not trust callers to have used it (parity with opfsAdapter C1).
  for (const seg of parts) {
    if (seg === "." || seg === ".." || seg.includes("\\")) {
      throw new CorpusError({ kind: "io", path, reason: `unsafe path segment: ${seg}` });
    }
  }
  const name = parts.pop();
  if (!name) throw new CorpusError({ kind: "io", path, reason: "path has no file component" });
  return { dirs: parts, name };
}

/** Validate the root handle is present (SSR / no-folder-connected guard). */
function requireRoot(handle: FsaDirHandle | null | undefined): FsaDirHandle {
  // The FSA API only exists in a browser, and a handle only exists once the user
  // has picked a folder. Either absence is "unavailable", never a raw TypeError.
  if (!handle || typeof handle.getDirectoryHandle !== "function") {
    throw new CorpusError({
      kind: "unavailable",
      reason: "no FileSystemDirectoryHandle (SSR, unsupported browser, or no folder connected)",
    });
  }
  return handle;
}

/** Walk (optionally creating) directory handles for the given segments. Returns
 *  null when `create` is false and a segment is missing. Re-resolves the chain per
 *  op — same as opfsAdapter (S1 review C3, deferred cross-adapter refactor). */
async function walkDir(root: FsaDirHandle, dirs: string[], create: boolean): Promise<FsaDirHandle | null> {
  let cur = root;
  for (const d of dirs) {
    try {
      cur = await cur.getDirectoryHandle(d, { create });
    } catch (e) {
      if (!create && isNotFound(e)) return null;
      throw e;
    }
  }
  return cur;
}

function wrap(path: string, e: unknown): never {
  if (e instanceof CorpusError) throw e;
  if (isPermissionLost(e)) throw new CorpusError({ kind: "fsa-permission-revoked" });
  if (isQuota(e)) throw new CorpusError({ kind: "quota-exceeded", substrate: "fsa" });
  throw new CorpusError({ kind: "io", path, reason: (e as Error)?.message ?? String(e) });
}

export function createFsaCorpusFs(handle: FsaDirHandle | null | undefined): CorpusFS {
  return {
    async readFile(path) {
      try {
        const root = requireRoot(handle);
        const { dirs, name } = splitPath(path);
        const dir = await walkDir(root, dirs, false);
        if (!dir) return null;
        let fh: FsaFileHandle;
        try {
          fh = await dir.getFileHandle(name, { create: false });
        } catch (e) {
          if (isNotFound(e)) return null;
          throw e;
        }
        const file = await fh.getFile();
        return new Uint8Array(await file.arrayBuffer());
      } catch (e) {
        wrap(path, e);
      }
    },

    async writeFile(path, bytes) {
      try {
        const root = requireRoot(handle);
        const { dirs, name } = splitPath(path);
        const dir = await walkDir(root, dirs, true);
        const fh = await dir!.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        try {
          await w.write(bytes);
        } finally {
          await w.close();
        }
      } catch (e) {
        wrap(path, e);
      }
    },

    async readdir(path) {
      try {
        const root = requireRoot(handle);
        const dirs = path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
        const dir = await walkDir(root, dirs, false);
        if (!dir) return [];
        const names: string[] = [];
        for await (const key of dir.keys()) names.push(key);
        return names.sort();
      } catch (e) {
        wrap(path, e);
      }
    },

    async rm(path) {
      try {
        const root = requireRoot(handle);
        const { dirs, name } = splitPath(path);
        const dir = await walkDir(root, dirs, false);
        if (!dir) return; // idempotent: parent dir missing -> nothing to remove
        try {
          await dir.removeEntry(name);
        } catch (e) {
          if (isNotFound(e)) return; // idempotent: file already gone
          throw e;
        }
      } catch (e) {
        wrap(path, e);
      }
    },

    async stat(path): Promise<CorpusStat | null> {
      try {
        const root = requireRoot(handle);
        const { dirs, name } = splitPath(path);
        const dir = await walkDir(root, dirs, false);
        if (!dir) return null;
        let fh: FsaFileHandle;
        try {
          fh = await dir.getFileHandle(name, { create: false });
        } catch (e) {
          if (isNotFound(e)) return null;
          throw e;
        }
        const file = await fh.getFile();
        return { size: file.size };
      } catch (e) {
        wrap(path, e);
      }
    },
  };
}
