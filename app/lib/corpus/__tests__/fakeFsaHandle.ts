/**
 * Map-backed fake `FileSystemDirectoryHandle` for tests (DD-009 sub-task S2).
 *
 * jsdom has no File System Access API, so the FSA adapter's success path cannot
 * run in CI. This fake mimics the subset of the FSA directory-handle surface the
 * adapter uses (getFileHandle / getDirectoryHandle / removeEntry / keys), backed
 * by a flat path→bytes Map — the same technique opfsAdapter.test.ts uses for OPFS.
 * The FSA adapter run over this fake is held to the SAME shared CorpusFS contract
 * as the in-memory fake and the OPFS adapter, so substitutability is verified.
 *
 * Optional fault injection (`faults`) lets the error-mapping tests drive
 * permission/quota/io failures without a real browser.
 */

import type { FsaDirHandle } from "../fsaAdapter";

export interface FsaFaults {
  /** Throw this on every createWritable() (write path). */
  onWrite?: () => never;
  /** Throw this on every getFileHandle({create:true}) (write path, pre-writable). */
  onGetFileHandleCreate?: () => never;
}

interface FakeFile {
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * Build a fake root directory handle backed by `store` (path → bytes). Directories
 * are implicit: a file "a/b/c.txt" makes "a" and "a/b" navigable. The returned
 * handle is keyed by its own POSIX prefix so nested getDirectoryHandle works.
 */
export function makeFakeFsaHandle(
  store: Map<string, Uint8Array> = new Map(),
  faults: FsaFaults = {},
): FsaDirHandle {
  function handleFor(prefix: string): FsaDirHandle {
    const join = (name: string) => (prefix === "" ? name : `${prefix}/${name}`);

    return {
      async getFileHandle(name, opts) {
        const full = join(name);
        const exists = store.has(full);
        if (!exists && !opts?.create) {
          throw new DOMException(`not found: ${full}`, "NotFoundError");
        }
        if (!exists && opts?.create) {
          if (faults.onGetFileHandleCreate) faults.onGetFileHandleCreate();
          store.set(full, new Uint8Array());
        }
        const fileHandle = {
          async getFile(): Promise<FakeFile> {
            const bytes = store.get(full) ?? new Uint8Array();
            return {
              size: bytes.byteLength,
              async arrayBuffer() {
                // Return a copy so the adapter can't mutate stored bytes.
                return bytes.slice().buffer;
              },
            };
          },
          async createWritable() {
            if (faults.onWrite) faults.onWrite();
            const chunks: Uint8Array[] = [];
            return {
              async write(data: Uint8Array) {
                chunks.push(data.slice());
              },
              async close() {
                // FSA createWritable truncates by default; emulate full-overwrite.
                const total = chunks.reduce((n, c) => n + c.byteLength, 0);
                const merged = new Uint8Array(total);
                let off = 0;
                for (const c of chunks) {
                  merged.set(c, off);
                  off += c.byteLength;
                }
                store.set(full, merged);
              },
            };
          },
        };
        return fileHandle;
      },

      async getDirectoryHandle(name, opts) {
        const full = join(name);
        const dirPrefix = `${full}/`;
        const exists = [...store.keys()].some((k) => k.startsWith(dirPrefix));
        if (!exists && !opts?.create) {
          throw new DOMException(`not found: ${full}`, "NotFoundError");
        }
        // create is a no-op until a file is written under it (implicit dirs).
        return handleFor(full);
      },

      async removeEntry(name) {
        const full = join(name);
        if (!store.has(full)) {
          throw new DOMException(`not found: ${full}`, "NotFoundError");
        }
        store.delete(full);
      },

      async *keys() {
        const childPrefix = prefix === "" ? "" : `${prefix}/`;
        const seen = new Set<string>();
        for (const key of store.keys()) {
          if (childPrefix !== "" && !key.startsWith(childPrefix)) continue;
          const rest = key.slice(childPrefix.length);
          if (rest === "") continue;
          const next = rest.split("/")[0];
          if (next && !seen.has(next)) {
            seen.add(next);
            yield next;
          }
        }
      },
    };
  }

  return handleFor("");
}
