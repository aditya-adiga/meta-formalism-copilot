/**
 * Mirror composite `CorpusFS` (DD-009 sub-task S2).
 *
 * Wraps a PRIMARY CorpusFS (the always-on OPFS cache) and an OPTIONAL MIRROR
 * CorpusFS (the user-picked FSA folder = source of truth). It IS a CorpusFS, so it
 * drops into the store's storage seam exactly where bare OPFS does today (it passes
 * the same shared contract). It is a decorator, not a leaf adapter (arch-review F1):
 * it adds the async mirror + retry + sync-ack concern on top of two plain CorpusFS
 * instances and nothing else — the consumer-side await/debounce and the status UI
 * are S5, not here.
 *
 * Write path (DD-009 §Decision):
 *   - writeFile/rm apply to the PRIMARY synchronously and resolve on primary
 *     success (no UI wait on the mirror).
 *   - the same op is then enqueued to the MIRROR asynchronously with bounded
 *     exponential backoff. Success/failure updates getMirrorStatus() and fires
 *     onMirror() listeners. A mirror failure is NEVER swallowed — it surfaces as a
 *     typed CorpusError in the status + ack (DD-009 §Failure-driven forbids silent
 *     fallback; this is the surfacing half of S1 review C4). The primary write
 *     still succeeded, so the user is not blocked, but the failure is visible.
 *
 * Read path (DD-009 §Decision):
 *   - readFile/stat return the primary's value; on a primary miss (null) they fall
 *     THROUGH to the mirror (recovery after a browser-storage clear). This is the
 *     one allowed fallthrough; it surfaces nothing misleading and never converts a
 *     genuine "absent in both" into a throw — null stays null (arch-review F4).
 *   - readdir returns the sorted UNION of primary + mirror child names (so a
 *     recovered mirror's files are visible), keeping the contract's sorted
 *     postcondition (arch-review F4).
 *
 * The sync-ack the (S5) "saved" indicator derives from is the MIRROR enqueue/flush
 * result, NOT the primary (OPFS) write-ack — "write completed" in OPFS/IndexedDB is
 * not "bytes on disk" (research Gotchas; DD-009 sync-ack contract). This module
 * makes that ack exist and be truthful; it ships no UI.
 */

import type { CorpusFS, CorpusStat } from "./types";
import { CorpusError } from "./types";

/** Mirror enqueue/flush state. Separate from CorpusErrorKind on purpose: it is a
 *  mirror-local lifecycle, not a new failure kind in the shared error union
 *  (arch-review F5). On "failed" it carries the typed CorpusError that caused it. */
export interface MirrorStatus {
  state: "idle" | "pending" | "ok" | "failed";
  /** Number of mirror operations currently queued/in-flight. */
  inFlight: number;
  /** The error from the most recent failed mirror op, if state is "failed". */
  lastError?: CorpusError;
}

export type MirrorListener = (status: MirrorStatus) => void;

export interface MirrorCorpusFs extends CorpusFS {
  /** Current mirror sync-ack status (the truthful "saved to folder" signal). */
  getMirrorStatus(): MirrorStatus;
  /** Subscribe to status changes (each enqueue start/success/failure). Returns an
   *  unsubscribe function. */
  onMirror(listener: MirrorListener): () => void;
}

export interface MirrorOptions {
  primary: CorpusFS;
  /** Optional FSA mirror. When absent, the composite behaves as the bare primary. */
  mirror?: CorpusFS | null;
  /** Retry backoff delays in ms; length = max attempts. Default 3 attempts. */
  backoffMs?: number[];
  /** Injectable sleep, for tests (default uses setTimeout so fake timers drive it). */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_BACKOFF = [100, 300, 900];

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toCorpusError(e: unknown): CorpusError {
  if (e instanceof CorpusError) return e;
  return new CorpusError({ kind: "io", path: "(mirror)", reason: (e as Error)?.message ?? String(e) });
}

export function createMirrorCorpusFs(opts: MirrorOptions): MirrorCorpusFs {
  const { primary, mirror, backoffMs = DEFAULT_BACKOFF, sleep = defaultSleep } = opts;

  const status: MirrorStatus = { state: "idle", inFlight: 0 };
  const listeners = new Set<MirrorListener>();

  function emit(): void {
    // Snapshot so a listener mutating its own subscription can't corrupt iteration.
    const snapshot: MirrorStatus = { ...status };
    for (const l of [...listeners]) l(snapshot);
  }

  /** Run a mirror op with bounded backoff. Updates status + emits on every
   *  transition. Resolves (never rejects) — a terminal failure is reported via
   *  status/ack, not by rejecting the caller (whose primary write already
   *  succeeded). This is "surface, don't swallow": the error IS recorded. */
  async function enqueueMirror(op: (m: CorpusFS) => Promise<void>): Promise<void> {
    if (!mirror) return;
    status.inFlight += 1;
    status.state = "pending";
    emit();
    let lastErr: CorpusError | undefined;
    for (let attempt = 0; attempt < backoffMs.length; attempt++) {
      try {
        await op(mirror);
        status.inFlight -= 1;
        // Only clear to "ok" when nothing else is in flight; otherwise stay pending.
        status.state = status.inFlight === 0 ? "ok" : "pending";
        status.lastError = undefined;
        emit();
        return;
      } catch (e) {
        lastErr = toCorpusError(e);
        // Backoff before the next attempt (no sleep after the final attempt).
        if (attempt < backoffMs.length - 1) await sleep(backoffMs[attempt]);
      }
    }
    // Exhausted all attempts — surface the failure, do not swallow.
    status.inFlight -= 1;
    status.state = "failed";
    status.lastError = lastErr;
    emit();
  }

  const composite: MirrorCorpusFs = {
    async readFile(path) {
      const fromPrimary = await primary.readFile(path);
      if (fromPrimary !== null) return fromPrimary;
      if (!mirror) return null;
      // Fallthrough recovery: primary miss -> read the source-of-truth folder.
      return mirror.readFile(path);
    },

    async writeFile(path, bytes) {
      // Primary is synchronous-resolving; the caller is unblocked here.
      await primary.writeFile(path, bytes);
      // Mirror asynchronously (fire-and-track, not awaited) with retry.
      void enqueueMirror((m) => m.writeFile(path, bytes));
    },

    async readdir(path) {
      const primaryNames = await primary.readdir(path);
      if (!mirror) return primaryNames;
      let mirrorNames: string[] = [];
      try {
        mirrorNames = await mirror.readdir(path);
      } catch {
        // A mirror readdir failure must not break a read; the union just omits it.
        mirrorNames = [];
      }
      // Sorted union so the contract's sorted-postcondition holds (arch-review F4).
      return [...new Set([...primaryNames, ...mirrorNames])].sort();
    },

    async rm(path) {
      await primary.rm(path);
      void enqueueMirror((m) => m.rm(path));
    },

    async stat(path): Promise<CorpusStat | null> {
      const fromPrimary = await primary.stat(path);
      if (fromPrimary !== null) return fromPrimary;
      if (!mirror) return null;
      return mirror.stat(path);
    },

    getMirrorStatus() {
      return { ...status };
    },

    onMirror(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return composite;
}
