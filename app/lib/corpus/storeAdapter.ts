/**
 * Storage-seam selection for the Zustand workspace store (DD-009 sub-task S1).
 *
 * `resolveWorkspaceStorage()` returns the zustand persist storage: the existing
 * debounced localStorage adapter by default, or a CorpusFS-backed storage when
 * the dev flag is on. The injection seam is typed as `CorpusFS` (arch-review
 * finding 3) so the S3 worker-proxy implementation drops in here without the
 * store ever knowing which adapter it talks to.
 *
 * In S1 the persist blob is stored as a SINGLE file via CorpusFS (blob mode) —
 * the files-per-artifact folder layout (paths.ts/manifest.ts) is built but not
 * used by the store until S4. This keeps S1 a pure substrate swap. The blob path
 * goes through `stateBlobPath` in paths.ts so the `state/` namespace fork is
 * greppable and S4 migration can find/reconcile it.
 */

import type { StateStorage } from "zustand/middleware";
import type { CorpusFS } from "./types";
import { createOpfsCorpusFs } from "./opfsAdapter";
import { isCorpusEnabled } from "./flag";
import { stateBlobPath } from "./paths";

// ---------------------------------------------------------------------------
// Default: debounced localStorage (moved verbatim from workspaceStore.ts so the
// OFF path is byte-for-byte the prior behavior — see the characterization test).
// Reads are synchronous (instant); writes are debounced by 300ms.
// ---------------------------------------------------------------------------
export function createDebouncedLocalStorage(): StateStorage {
  let pending: ReturnType<typeof setTimeout> | null = null;
  return {
    getItem: (name) => localStorage.getItem(name),
    setItem: (name, value) => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        try {
          localStorage.setItem(name, value);
        } catch (e) {
          console.warn("Failed to persist workspace (localStorage quota exceeded):", e);
        }
        pending = null;
      }, 300);
    },
    removeItem: (name) => {
      if (pending) clearTimeout(pending);
      pending = null;
      localStorage.removeItem(name);
    },
  };
}

// ---------------------------------------------------------------------------
// Corpus-backed storage: stores the persist blob as one file under `state/`.
// The seam type is CorpusFS, not a concrete adapter (arch-review finding 3).
// ---------------------------------------------------------------------------
export function createCorpusBackedStorage(fs: CorpusFS): StateStorage {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const pathFor = (name: string) => stateBlobPath(name);
  return {
    getItem: async (name) => {
      const bytes = await fs.readFile(pathFor(name));
      return bytes ? dec.decode(bytes) : null;
    },
    setItem: async (name, value) => {
      await fs.writeFile(pathFor(name), enc.encode(value));
    },
    removeItem: async (name) => {
      await fs.rm(pathFor(name));
    },
  };
}

/** Selected once when the store's persist middleware initializes. */
export function resolveWorkspaceStorage(): StateStorage {
  if (isCorpusEnabled()) {
    return createCorpusBackedStorage(createOpfsCorpusFs());
  }
  return createDebouncedLocalStorage();
}
