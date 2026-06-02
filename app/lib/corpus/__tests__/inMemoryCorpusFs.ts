/**
 * Map-backed in-memory `CorpusFS` for tests (DD-009 sub-task S1).
 *
 * Lets corpus logic be verified in CI even though jsdom has no OPFS. The OPFS
 * adapter and this fake are both asserted against the same shared contract suite
 * (corpusFsContract.ts), so substitutability (LSP) is verified, not assumed.
 *
 * Directories are implicit: a file at "a/b/c.txt" makes "a" and "a/b" listable.
 */

import type { CorpusFS, CorpusStat } from "../types";

function normalize(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

export function createInMemoryCorpusFs(): CorpusFS {
  const files = new Map<string, Uint8Array>();

  return {
    async readFile(path) {
      return files.get(normalize(path)) ?? null;
    },

    async writeFile(path, bytes) {
      // Copy so later mutation of the caller's array can't alter stored bytes.
      files.set(normalize(path), bytes.slice());
    },

    async readdir(path) {
      const dir = normalize(path);
      const prefix = dir === "" ? "" : `${dir}/`;
      const children = new Set<string>();
      for (const key of files.keys()) {
        if (prefix !== "" && !key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        if (rest === "") continue;
        const next = rest.split("/")[0];
        if (next) children.add(next);
      }
      return [...children].sort();
    },

    async rm(path) {
      files.delete(normalize(path)); // idempotent: Map.delete on a missing key is a no-op
    },

    async stat(path): Promise<CorpusStat | null> {
      const bytes = files.get(normalize(path));
      return bytes ? { size: bytes.byteLength } : null;
    },
  };
}
