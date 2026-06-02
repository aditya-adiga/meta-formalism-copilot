/**
 * Corpus filesystem abstraction (DD-009 sub-task S0+S1).
 *
 * `CorpusFS` is the single FS seam every later sub-task binds to:
 *   - S1 OPFS adapter implements it (always-on local cache)
 *   - S2 FSA folder mirror writes through it
 *   - S4 migration + session model reads/writes the folder layout through it
 *
 * Design notes (see docs/decisions/009-artifact-corpus-architecture.md and
 * docs/reviews/architecture-review.md):
 *  - Bytes + paths, not strings + keys. Sources are binary (PDFs), so the
 *    interface is `Uint8Array`-oriented; do not narrow it to strings.
 *  - Async everywhere. OPFS and FSA are both async, and DD-009 mandates the
 *    writer eventually run in a worker (S3). An async interface makes that a
 *    transport swap, not an interface change — so consumers MUST bind to this
 *    interface, never to a concrete adapter (arch-review finding 3).
 *  - "Not found" is `null` from `readFile`/`stat` and `[]` from `readdir`;
 *    everything else rejects with a `CorpusError`. Callers never see `undefined`.
 *  - GIT IS NOT PART OF THIS INTERFACE. S3's commit/log/push/pull belong on a
 *    separate `CorpusGit` interface that operates *over* a `CorpusFS`. Do not add
 *    git methods here — that would force the in-memory fake and every non-git
 *    consumer to stub operations they don't use (arch-review finding 2, ISP).
 */

// ---------------------------------------------------------------------------
// Error model — one source of truth for the kind set (arch-review finding 1).
// `CorpusError` is the thrown form; `CorpusWorkerError` is its postMessage-
// serializable twin. They differ only in transport, never in the kind set.
// ---------------------------------------------------------------------------

/** Which substrate raised a space/quota failure. Substrate-neutral so S2 (FSA)
 *  and future caches reuse the same `quota-exceeded` kind rather than minting
 *  adapter-specific kinds the exhaustive switches would all have to learn. */
export type CorpusSubstrate = "opfs" | "fsa" | "remote";

/**
 * The complete set of corpus failure kinds. Every exhaustive `switch` over a
 * corpus error binds to this union; adding a kind here forces every consumer to
 * handle it at compile time (the failure-driven-UI mandate, DD-009 §Failure-driven).
 */
export type CorpusErrorKind =
  | { kind: "not-found"; path: string }
  | { kind: "quota-exceeded"; substrate: CorpusSubstrate; needed?: number; available?: number }
  | { kind: "unavailable"; reason: string } // e.g. SSR / no navigator.storage
  | { kind: "io"; path: string; reason: string }
  | { kind: "fsa-permission-revoked" }
  | { kind: "remote-auth-expired" }
  | { kind: "browser-storage-cleared" }
  | { kind: "git-conflict"; path: string };

/** Thrown form of a corpus failure. `detail` carries the discriminated kind. */
export class CorpusError extends Error {
  readonly detail: CorpusErrorKind;
  constructor(detail: CorpusErrorKind, message?: string) {
    super(message ?? describeCorpusError(detail));
    this.name = "CorpusError";
    this.detail = detail;
  }
}

/** Serializable twin for crossing a worker boundary (S3). Reconstruct with
 *  `new CorpusError(payload.detail, payload.message)` on the main thread. */
export type CorpusWorkerError = {
  __corpusError: true;
  detail: CorpusErrorKind;
  message: string;
};

export function toWorkerError(err: CorpusError): CorpusWorkerError {
  return { __corpusError: true, detail: err.detail, message: err.message };
}

export function isCorpusWorkerError(v: unknown): v is CorpusWorkerError {
  return typeof v === "object" && v !== null && (v as { __corpusError?: unknown }).__corpusError === true;
}

/** Human-readable default message for a kind (used when no override is given). */
export function describeCorpusError(d: CorpusErrorKind): string {
  switch (d.kind) {
    case "not-found": return `corpus path not found: ${d.path}`;
    case "quota-exceeded": return `corpus storage quota exceeded (${d.substrate})`;
    case "unavailable": return `corpus storage unavailable: ${d.reason}`;
    case "io": return `corpus i/o error at ${d.path}: ${d.reason}`;
    case "fsa-permission-revoked": return "corpus folder permission was revoked";
    case "remote-auth-expired": return "corpus remote authentication expired";
    case "browser-storage-cleared": return "corpus browser storage was cleared";
    case "git-conflict": return `corpus git conflict at ${d.path}`;
    default: return assertNever(d);
  }
}

/** Compile-time exhaustiveness guard. Reaching this at runtime means a kind was
 *  added to `CorpusErrorKind` without updating a switch — TS flags it first. */
export function assertNever(x: never): never {
  throw new Error(`unhandled corpus error kind: ${JSON.stringify(x)}`);
}

// ---------------------------------------------------------------------------
// The filesystem interface.
// ---------------------------------------------------------------------------

export interface CorpusStat {
  size: number;
}

/**
 * Async, bytes-and-paths filesystem seam. Paths are POSIX-style, relative to the
 * corpus root, using "/" separators and no leading slash (e.g.
 * "workspaces/my-slug/artifacts/semiformal/v0001.md"). Implementations create
 * intermediate directories on write.
 */
export interface CorpusFS {
  /** Returns file bytes, or `null` if the path does not exist. Rejects with a
   *  `CorpusError` for any other failure. */
  readFile(path: string): Promise<Uint8Array | null>;
  /** Writes bytes, creating intermediate directories as needed. */
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  /** Lists immediate child names of a directory; `[]` if the directory is
   *  missing or empty. Names only, not full paths. */
  readdir(path: string): Promise<string[]>;
  /** Removes a file. Idempotent: resolves (no-op) if the path does not exist. */
  rm(path: string): Promise<void>;
  /** Returns `{ size }` for an existing file, or `null` if it does not exist. */
  stat(path: string): Promise<CorpusStat | null>;
}
