/**
 * OPFS-backed `CorpusFS` adapter (DD-009 sub-task S1).
 *
 * Implements the corpus filesystem over the Origin Private File System
 * (`navigator.storage.getDirectory()`). This is the always-on local working
 * copy; FSA mirror (S2) and git (S3) layer on top.
 *
 * Two contracts this file is responsible for (test-strategy G7/G8, arch-review):
 *  - SSR / unavailable guard: any call in an environment without
 *    `navigator.storage.getDirectory` rejects with a typed `CorpusError`
 *    ({kind:"unavailable"}), never a raw `TypeError`.
 *  - Failure reification: a quota failure rejects with {kind:"quota-exceeded",
 *    substrate:"opfs"} — it is NOT swallowed with console.warn the way the
 *    legacy localStorage adapter does (createDebouncedLocalStorage in
 *    storeAdapter.ts).
 *
 * OPFS handle types are declared locally rather than relying on lib.dom, whose
 * OPFS surface (notably async `keys()`) varies by TypeScript version — keeping
 * our own minimal shapes makes the build stable across upgrades.
 */

import type { CorpusFS, CorpusStat } from "./types";
import { CorpusError } from "./types";

// --- Minimal local OPFS typings ---
interface OpfsWritable {
  // We only ever write Uint8Array; typing it narrowly avoids the lib.dom
  // BufferSource/ArrayBufferLike strictness mismatch across TS versions.
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}
interface OpfsFileHandle {
  getFile(): Promise<{ size: number; arrayBuffer(): Promise<ArrayBuffer> }>;
  createWritable(): Promise<OpfsWritable>;
}
interface OpfsDirHandle {
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<OpfsFileHandle>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<OpfsDirHandle>;
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>;
  keys(): AsyncIterableIterator<string>;
}

function isNotFound(e: unknown): boolean {
  return e instanceof DOMException && (e.name === "NotFoundError" || e.name === "TypeMismatchError");
}
function isQuota(e: unknown): boolean {
  return e instanceof DOMException && (e.name === "QuotaExceededError" || e.name === "QUOTA_EXCEEDED_ERR");
}

async function getRoot(): Promise<OpfsDirHandle> {
  const storage = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!storage || typeof storage.getDirectory !== "function") {
    throw new CorpusError({ kind: "unavailable", reason: "navigator.storage.getDirectory is not available (SSR or unsupported browser)" });
  }
  return (await storage.getDirectory()) as unknown as OpfsDirHandle;
}

function splitPath(path: string): { dirs: string[]; name: string } {
  const parts = path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  // Defense-in-depth: paths.ts is the sanitizing choke point, but the adapter
  // must not trust callers to have used it. Reject traversal/backslash segments
  // rather than resolving them (an adapter is the wrong layer to interpret "..").
  for (const seg of parts) {
    if (seg === "." || seg === ".." || seg.includes("\\")) {
      throw new CorpusError({ kind: "io", path, reason: `unsafe path segment: ${seg}` });
    }
  }
  const name = parts.pop();
  if (!name) throw new CorpusError({ kind: "io", path, reason: "path has no file component" });
  return { dirs: parts, name };
}

/** Walk (optionally creating) directory handles for the given segments. Returns
 *  null when `create` is false and a segment is missing. */
async function walkDir(root: OpfsDirHandle, dirs: string[], create: boolean): Promise<OpfsDirHandle | null> {
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
  if (isQuota(e)) throw new CorpusError({ kind: "quota-exceeded", substrate: "opfs" });
  throw new CorpusError({ kind: "io", path, reason: (e as Error)?.message ?? String(e) });
}

export function createOpfsCorpusFs(): CorpusFS {
  return {
    async readFile(path) {
      try {
        const root = await getRoot();
        const { dirs, name } = splitPath(path);
        const dir = await walkDir(root, dirs, false);
        if (!dir) return null;
        let fh: OpfsFileHandle;
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
        const root = await getRoot();
        const { dirs, name } = splitPath(path);
        const dir = await walkDir(root, dirs, true);
        const fh = await dir!.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        try {
          // Pass a fresh ArrayBuffer view; some implementations dislike shared buffers.
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
        const root = await getRoot();
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
        const root = await getRoot();
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
        const root = await getRoot();
        const { dirs, name } = splitPath(path);
        const dir = await walkDir(root, dirs, false);
        if (!dir) return null;
        let fh: OpfsFileHandle;
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
