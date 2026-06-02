/**
 * iso-git fs shim over `CorpusFS` (DD-009 sub-task S3).
 *
 * isomorphic-git takes an `fs` plugin exposing a node-`fs`-like promise surface
 * (`readFile/writeFile/unlink/readdir/mkdir/rmdir/stat/lstat`). Our `CorpusFS` is
 * narrower (5 bytes+paths methods, no `mkdir`/`lstat`/dir-stat). This shim adapts
 * one to the other so iso-git runs on the SAME OPFS substrate the rest of the
 * corpus uses (DD-009's single-substrate mandate) rather than a second store like
 * lightning-fs's IndexedDB.
 *
 * Why a real adapter, not a passthrough (arch-review F7): iso-git BRANCHES on
 * node-style error codes (`err.code === "ENOENT" / "ENOTDIR" / "EEXIST"`) and on
 * `stats.isDirectory()`/`isFile()`. `CorpusFS` instead returns `null` for missing
 * and only `{size}` for stat. The shim therefore:
 *   - converts "missing" into a thrown error carrying `.code = "ENOENT"`;
 *   - synthesizes directory stats (a path that is not a file but has children is a
 *     directory) so iso-git can walk `.git/` subdirs;
 *   - makes `mkdir` a no-op (CorpusFS creates intermediate dirs implicitly on
 *     write) and `unlink`/`rmdir` idempotent.
 *
 * The shim is verified by running REAL iso-git over it in CI (gitCore.test.ts
 * substrate-parity run), not just unit-tested in isolation.
 *
 * iso-git's FileSystem wrapper detects a promise client by an enumerable
 * `promises` property (see isomorphic-git/index.js `class FileSystem`), so this
 * returns `{ promises: {...} }`.
 */

import type { CorpusFS } from "./types";

/** Node-style error with a `.code` iso-git branches on. */
class FsError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "FsError";
  }
}

/** The stat shape iso-git's `normalizeStats` consumes. `mode`/`size` are read;
 *  the time/owner fields are passed through `% MAX_UINT32`, so 0 is safe.
 *  `isFile`/`isDirectory`/`isSymbolicLink` are called directly. */
interface ShimStats {
  type: "file" | "dir";
  mode: number;
  size: number;
  ino: number;
  mtimeMs: number;
  ctimeMs: number;
  dev: number;
  uid: number;
  gid: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

function makeStats(type: "file" | "dir", size: number): ShimStats {
  return {
    type,
    // Regular file (0o100644) vs directory (0o040000) modes iso-git expects.
    mode: type === "file" ? 0o100644 : 0o040000,
    size,
    ino: 0,
    mtimeMs: 0,
    ctimeMs: 0,
    dev: 0,
    uid: 0,
    gid: 0,
    isFile: () => type === "file",
    isDirectory: () => type === "dir",
    isSymbolicLink: () => false,
  };
}

/** Strip a leading slash / `dir` prefix into a CorpusFS-relative POSIX path.
 *  iso-git passes absolute-looking paths rooted at `dir` (e.g. `${dir}/.git/HEAD`);
 *  CorpusFS paths are root-relative with no leading slash. */
function rel(root: string, p: string): string {
  let s = p.replace(/\\/g, "/");
  if (root && (s === root || s.startsWith(root + "/"))) {
    s = s.slice(root.length);
  }
  s = s.replace(/^\/+/, "").replace(/\/+$/, "");
  // iso-git stats the working-tree root as "." (or the bare `dir`); normalize it
  // to "" so the root is recognized as the corpus directory itself.
  return s === "." ? "" : s;
}

/** iso-git's PromiseFsClient shape. NOTE: iso-git's `bindFs` unconditionally
 *  `.bind()`s ALL of readFile/writeFile/mkdir/rmdir/unlink/stat/lstat/readdir/
 *  readlink/symlink — even the ones its docs mark "optional" — so EVERY method
 *  here MUST exist as a function or `git.init` throws `undefined.bind`. (Verified
 *  against iso-git@1.38.3 index.cjs:4935-4951 during the S3 spike.) */
export interface GitFsClient {
  promises: {
    readFile(path: string, options?: { encoding?: string } | string): Promise<Uint8Array | string>;
    writeFile(path: string, data: Uint8Array | string, options?: unknown): Promise<void>;
    unlink(path: string): Promise<void>;
    readdir(path: string): Promise<string[]>;
    mkdir(path: string, options?: unknown): Promise<void>;
    rmdir(path: string): Promise<void>;
    stat(path: string): Promise<ShimStats>;
    lstat(path: string): Promise<ShimStats>;
    readlink(path: string): Promise<string>;
    symlink(target: string, path: string): Promise<void>;
  };
}

/**
 * Build an iso-git fs client backed by a `CorpusFS`. `root` is the corpus-relative
 * dir iso-git was given as its `dir` (usually "" — the corpus root). Pass the same
 * value as iso-git's `dir`/`gitdir` base.
 */
export function createGitFs(fs: CorpusFS, root = ""): GitFsClient {
  const promises = {
    async readFile(path: string, options?: { encoding?: string } | string): Promise<Uint8Array | string> {
      const bytes = await fs.readFile(rel(root, path));
      if (bytes === null) throw new FsError("ENOENT", `ENOENT: no such file, open '${path}'`);
      const encoding = typeof options === "string" ? options : options?.encoding;
      if (encoding) return new TextDecoder().decode(bytes);
      return bytes;
    },

    async writeFile(path: string, data: Uint8Array | string): Promise<void> {
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
      await fs.writeFile(rel(root, path), bytes);
    },

    async unlink(path: string): Promise<void> {
      // CorpusFS.rm is already idempotent (no-op on missing).
      await fs.rm(rel(root, path));
    },

    async readdir(path: string): Promise<string[]> {
      // CorpusFS.readdir returns [] for missing/empty; iso-git tolerates [] but
      // throws-then-recovers on ENOENT in some paths. [] is the correct, simplest
      // contract for "directory with no entries" and matches CorpusFS.
      return fs.readdir(rel(root, path));
    },

    async mkdir(): Promise<void> {
      // No-op: CorpusFS creates intermediate directories implicitly on writeFile.
      // iso-git's FileSystem.mkdir swallows EEXIST, so a silent success is correct.
    },

    async rmdir(path: string): Promise<void> {
      // Directories are implicit in CorpusFS (they vanish when empty), so removing
      // a "directory" is a no-op unless it happens to name a file; rm is idempotent.
      await fs.rm(rel(root, path));
    },

    async stat(path: string): Promise<ShimStats> {
      const r = rel(root, path);
      // The corpus root itself is always a directory (iso-git lstats "." while
      // walking the working tree); a bare-root readdir would be [] before any
      // files exist, so special-case it rather than ENOENT.
      if (r === "") return makeStats("dir", 0);
      const st = await fs.stat(r);
      if (st !== null) return makeStats("file", st.size);
      // Not a file — is it a directory? A dir with children is listable.
      const children = await fs.readdir(r);
      if (children.length > 0) return makeStats("dir", 0);
      // Neither a file nor a non-empty dir: iso-git expects an ENOENT throw here.
      throw new FsError("ENOENT", `ENOENT: no such file or directory, stat '${path}'`);
    },

    async lstat(path: string): Promise<ShimStats> {
      // No symlinks in the corpus; lstat == stat.
      return promises.stat(path);
    },

    async readlink(path: string): Promise<string> {
      // The corpus has no symlinks. iso-git only calls readlink after lstat
      // reports a symlink (which we never do), so reaching here is "not a link".
      throw new FsError("EINVAL", `EINVAL: not a symbolic link, readlink '${path}'`);
    },

    async symlink(): Promise<void> {
      // The corpus does not support symlinks; iso-git checks out symlink entries
      // as regular files when this is unavailable.
      throw new FsError("ENOSYS", "symlink is not supported by the corpus filesystem");
    },
  };

  return { promises };
}
