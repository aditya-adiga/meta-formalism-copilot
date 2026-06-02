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
 *
 * S2 adds a THIRD selection arm: when the user has connected an FSA folder, the
 * store's CorpusFS becomes a mirror composite (OPFS primary + the connected FSA
 * mirror) instead of bare OPFS. The connected FSA CorpusFS is INJECTED into
 * `resolveCorpusFs` (not reached out of fsaPicker's internals) so the selection
 * stays unit-testable with an in-memory fake and the composition root owns the
 * wiring (arch-review F2/F3). flag-OFF and flag-ON/no-folder arms are unchanged
 * from S1 (byte-for-byte the prior behavior).
 */

import type { StateStorage } from "zustand/middleware";
import type { CorpusFS } from "./types";
import { createOpfsCorpusFs } from "./opfsAdapter";
import { createMirrorCorpusFs } from "./mirrorFs";
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

/**
 * Build the CorpusFS the store should use when the corpus flag is on. With a
 * connected FSA mirror, returns the OPFS+FSA mirror composite; otherwise bare
 * OPFS (S1 behavior). Factored out of `resolveWorkspaceStorage` so future arms
 * (S3 worker-proxy, S4 folder-layout) add to one focused function and the
 * StateStorage wrapping stays untouched (arch-review F2). `connectedMirror` is
 * injected so the selection is testable with an in-memory fake (arch-review F3).
 * `primary` defaults to the OPFS adapter and is injectable only for tests (jsdom
 * has no OPFS) — production always uses the default.
 */
export function resolveCorpusFs(
  connectedMirror?: CorpusFS | null,
  primary: CorpusFS = createOpfsCorpusFs(),
): CorpusFS {
  if (connectedMirror) {
    return createMirrorCorpusFs({ primary, mirror: connectedMirror });
  }
  return primary;
}

/**
 * Selected once when the store's persist middleware initializes.
 *
 * `connectedMirror` is the FSA-backed CorpusFS for a user-connected folder, or
 * null/undefined when none is connected (the common case at init — the folder is
 * connected later via a user gesture, after which the store would be re-pointed).
 * Default-off + production-guarded via `isCorpusEnabled()` (S1).
 */
export function resolveWorkspaceStorage(connectedMirror?: CorpusFS | null): StateStorage {
  if (isCorpusEnabled()) {
    return createCorpusBackedStorage(resolveCorpusFs(connectedMirror));
  }
  return createDebouncedLocalStorage();
}
