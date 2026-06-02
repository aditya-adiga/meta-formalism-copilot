/**
 * Git logic over an injected filesystem + http client (DD-009 sub-task S3).
 *
 * This is the PLAIN, testable half of the git pipeline (arch-review F2): it calls
 * REAL `isomorphic-git` and is exercised in CI against a Node tmpdir (vitest runs
 * on Node — see gitCore.test.ts), with no `Worker` involved. The thin worker
 * (gitWorker.ts) just constructs this with an OPFS-backed `gitFs` + the web http
 * client and forwards messages to it; the proxy (gitWorkerClient.ts) is what the
 * main thread holds.
 *
 * All iso-git deps are INJECTED (arch-review F3): `fs` (the gitFs shim), `http`
 * (`isomorphic-git/http/web` in the worker, `.../http/node` or a fake in tests),
 * `dir`, and `onAuth`. Nothing here hard-imports a global http client, so CI can
 * drive push/pull failures with a fake http that returns 401.
 *
 * Error mapping (DD-009 §Failure-driven — typed, never generic io):
 *   - remote auth failure (HTTP 401/403, or a cancelled auth) -> remote-auth-expired
 *   - merge conflict on pull -> git-conflict {path} (v1 last-write-wins detection;
 *     the warning UI is S5). The first conflicted filepath is surfaced.
 *
 * `log` is lazy + paginated (the 3000-commit-cliff mitigation): it fetches one
 * extra entry beyond `depth` to compute `nextCursor`, returns at most `depth`, and
 * never walks the whole history eagerly.
 */

import * as git from "isomorphic-git";
import { CorpusError } from "./types";
import type {
  CorpusGit,
  GitCommitResult,
  GitLogEntry,
  GitLogOptions,
  GitLogPage,
  GitStatusEntry,
} from "./types";
import type { GitFsClient } from "./gitFs";

/** Minimal shape of an iso-git http client (so we don't depend on its exact
 *  exported type, which varies between the node/web entry points). */
export type GitHttpClient = Parameters<typeof git.push>[0]["http"];

export interface GitCoreDeps {
  fs: GitFsClient;
  /** iso-git http client (web/node entry, or a fake in tests). Optional: only
   *  push/pull need it. */
  http?: GitHttpClient;
  /** The working-tree dir iso-git operates on (the corpus root; usually ""). */
  dir: string;
  /** The remote URL for push/pull (omit for local-only mode). */
  remoteUrl?: string;
  /** Auth callback for the remote (returns {username,password} or {cancel:true}). */
  onAuth?: () => { username?: string; password?: string; cancel?: boolean };
  /** Commit author identity. */
  author?: { name: string; email: string };
  /** Default page size for `log` when none is given. */
  defaultLogDepth?: number;
}

const DEFAULT_LOG_DEPTH = 30;
const DEFAULT_AUTHOR = { name: "Metaformalism Copilot", email: "corpus@metaformalism.local" };

/** Does this iso-git error indicate a remote-auth failure? HTTP 401/403, or a
 *  user-cancelled auth prompt (iso-git throws UserCanceledError when onAuth
 *  returns {cancel:true}). */
function isAuthFailure(e: unknown): boolean {
  const err = e as { code?: string; data?: { statusCode?: number } };
  if (err?.code === "UserCanceledError") return true;
  if (err?.code === "HttpError" && (err.data?.statusCode === 401 || err.data?.statusCode === 403)) return true;
  return false;
}

/** A merge conflict carries the conflicted filepaths in `.data.filepaths`. */
function conflictPath(e: unknown): string | null {
  const err = e as { code?: string; data?: { filepaths?: string[] } };
  if (err?.code === "MergeConflictError") {
    return err.data?.filepaths?.[0] ?? "(unknown)";
  }
  return null;
}

/** Map any iso-git throw to a typed CorpusError. Auth + conflict get their
 *  dedicated kinds; everything else is a generic io error (still typed). */
function mapGitError(e: unknown): CorpusError {
  if (e instanceof CorpusError) return e;
  const cp = conflictPath(e);
  if (cp !== null) return new CorpusError({ kind: "git-conflict", path: cp });
  if (isAuthFailure(e)) return new CorpusError({ kind: "remote-auth-expired" });
  return new CorpusError({ kind: "io", path: "(git)", reason: (e as Error)?.message ?? String(e) });
}

/** Test-only export of the error mapper, so the conflict/auth mapping can be
 *  asserted against REAL iso-git errors without standing up a remote. */
export function mapGitErrorForTest(e: unknown): CorpusError {
  return mapGitError(e);
}

export function createGitCore(deps: GitCoreDeps): CorpusGit {
  const { fs, http, dir, remoteUrl, onAuth, defaultLogDepth = DEFAULT_LOG_DEPTH } = deps;
  const author = deps.author ?? DEFAULT_AUTHOR;

  return {
    async init(): Promise<void> {
      try {
        await git.init({ fs, dir, defaultBranch: "main" });
      } catch (e) {
        throw mapGitError(e);
      }
    },

    async commit(message: string): Promise<GitCommitResult> {
      try {
        // Stage every working-tree path. We explicitly `add`/`remove` each file
        // rather than trusting statusMatrix's stat-cache fast-path: the CorpusFS
        // shim has no real mtime/ino (it returns 0), so iso-git's "did this file
        // change?" stat heuristic would treat changed-content-same-size files as
        // unmodified. Re-adding forces a content re-hash, which is correct.
        // (Verified in the S3 spike: zero-mtime stats defeat statusMatrix's cache.)
        const before = await git.statusMatrix({ fs, dir });
        for (const [filepath, , workdir] of before) {
          if (workdir === 0) {
            await git.remove({ fs, dir, filepath }); // deleted in working tree
          } else {
            await git.add({ fs, dir, filepath }); // re-hash add/modify
          }
        }
        // After staging, a real change is any row whose staged state differs from
        // HEAD. (head, _workdir, stage): stage !== head means the commit would
        // change the tree.
        const after = await git.statusMatrix({ fs, dir });
        const hasChanges = after.some(([, head, , stage]) => stage !== head);
        if (!hasChanges) {
          const oid = await git.resolveRef({ fs, dir, ref: "HEAD" }).catch(() => "");
          return { oid, noChange: true };
        }
        const oid = await git.commit({ fs, dir, message, author });
        return { oid, noChange: false };
      } catch (e) {
        throw mapGitError(e);
      }
    },

    async log(options: GitLogOptions = {}): Promise<GitLogPage> {
      try {
        const depth = options.depth ?? defaultLogDepth;
        // Fetch one extra entry to compute the next cursor without re-walking.
        const raw = await git.log({
          fs,
          dir,
          filepath: options.filepath,
          ref: options.cursor ?? "HEAD",
          depth: depth + 1,
          // `force` lets log tolerate a filepath that doesn't exist at HEAD.
          force: options.filepath !== undefined,
        });
        const page = raw.slice(0, depth);
        const nextCursor = raw.length > depth ? raw[depth].oid : null;
        const entries: GitLogEntry[] = page.map((c) => ({
          oid: c.oid,
          message: c.commit.message,
          author: {
            name: c.commit.author.name,
            email: c.commit.author.email,
            timestamp: c.commit.author.timestamp,
          },
        }));
        return { entries, nextCursor };
      } catch (e) {
        // An empty repo (no HEAD yet) is an empty history, not an error.
        const err = e as { code?: string };
        if (err?.code === "NotFoundError" || err?.code === "ResolveRefError") {
          return { entries: [], nextCursor: null };
        }
        throw mapGitError(e);
      }
    },

    async status(): Promise<GitStatusEntry[]> {
      try {
        // statusMatrix uses a (size + mtime) stat fast-path to decide whether to
        // re-hash a file. Real OPFS tracks File.lastModified, so a same-size edit
        // is detected in production; a zero-mtime FS (the in-memory test fake)
        // would miss a same-size content change. commit() avoids this by always
        // re-adding; status() is a read and accepts the FS's mtime fidelity.
        const matrix = await git.statusMatrix({ fs, dir });
        return matrix.map(([path, head, workdir]) => {
          let status: GitStatusEntry["status"];
          if (head === 0 && workdir > 0) status = "added";
          else if (head > 0 && workdir === 0) status = "deleted";
          else if (head === 1 && workdir === 1) status = "unmodified";
          else status = "modified";
          return { path, status };
        });
      } catch (e) {
        throw mapGitError(e);
      }
    },

    async push(): Promise<void> {
      try {
        if (!http || !remoteUrl) {
          throw new CorpusError({ kind: "io", path: "(git)", reason: "no remote configured for push" });
        }
        await git.push({ fs, http, dir, url: remoteUrl, onAuth });
      } catch (e) {
        throw mapGitError(e);
      }
    },

    async pull(): Promise<void> {
      try {
        if (!http || !remoteUrl) {
          throw new CorpusError({ kind: "io", path: "(git)", reason: "no remote configured for pull" });
        }
        // pull merges with iso-git's default conflict behavior: a both-sides edit
        // that can't auto-resolve throws MergeConflictError, which mapGitError
        // turns into {kind:"git-conflict", path}. v1's last-write-wins resolution
        // + the warning UI are S5's job (this surfaces the conflict; S5 resolves).
        await git.pull({ fs, http, dir, url: remoteUrl, onAuth, author });
      } catch (e) {
        throw mapGitError(e);
      }
    },
  };
}
