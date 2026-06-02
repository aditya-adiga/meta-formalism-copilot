/**
 * Corpus folder-layout path builders (DD-009 sub-task S0).
 *
 * The on-disk shape (DD-009 §Folder layout):
 *
 *   <corpus-root>/
 *   ├── settings.json
 *   └── workspaces/<slug>/
 *       ├── workspace.json
 *       ├── sources/<source-id>.<ext>
 *       ├── artifacts/<type>/v####.md   (+ meta.json per type)
 *       ├── custom-types/<custom-type-id>.json
 *       └── decomposition/...
 *
 * All builders return POSIX-style paths relative to the corpus root (no leading
 * slash), suitable for passing straight to a `CorpusFS`. The only source of
 * corpus paths is this module — callers must never hand-concatenate, so the
 * traversal guard in `workspaceSlug` is the single choke point that keeps
 * untrusted workspace titles inside `workspaces/`.
 */

/** Width of the zero-padded version number in artifact filenames (v0001.md). */
const VERSION_PAD = 4;

/** Characters allowed in a sanitized slug or id segment. Everything else is
 *  collapsed to a hyphen so a value can never contain "/", "\\", "." runs, or
 *  control characters that would let it escape its directory. */
const SAFE_SEGMENT = /[^a-zA-Z0-9_-]+/g;

/**
 * Sanitize a workspace title into a filesystem-safe slug that cannot escape
 * `workspaces/`. Strips path separators, dot-segments, and unicode; collapses
 * runs of unsafe characters to a single hyphen; trims leading/trailing hyphens.
 * Throws if nothing safe remains (an all-unsafe title must not silently become "").
 */
export function workspaceSlug(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(SAFE_SEGMENT, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  if (!slug) {
    throw new Error(`workspace title produced an empty slug: ${JSON.stringify(title)}`);
  }
  return slug;
}

/** Sanitize an arbitrary id (source id, custom-type id, artifact type) for use
 *  as a single path segment. Same guarantees as `workspaceSlug` but preserves
 *  case (ids are typically already safe, e.g. "custom-abc123"). */
export function safeSegment(id: string): string {
  const seg = id.normalize("NFKD").replace(SAFE_SEGMENT, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
  if (!seg) {
    throw new Error(`id produced an empty path segment: ${JSON.stringify(id)}`);
  }
  return seg;
}

/** Sanitize a file extension to alphanumerics; defaults to "bin" if empty. */
function safeExt(ext: string): string {
  const e = ext.replace(/^\.+/, "").replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
  return e || "bin";
}

// --- Path builders (all relative to corpus root) ---------------------------

export const SETTINGS_PATH = "settings.json";

export function workspaceDir(slug: string): string {
  return `workspaces/${workspaceSlug(slug)}`;
}

export function workspaceManifestPath(slug: string): string {
  return `${workspaceDir(slug)}/workspace.json`;
}

export function sourcePath(slug: string, sourceId: string, ext: string): string {
  return `${workspaceDir(slug)}/sources/${safeSegment(sourceId)}.${safeExt(ext)}`;
}

export function artifactDir(slug: string, artifactType: string): string {
  return `${workspaceDir(slug)}/artifacts/${safeSegment(artifactType)}`;
}

/** Zero-padded version file, e.g. artifactVersionPath(s,"semiformal",1) ->
 *  "workspaces/<s>/artifacts/semiformal/v0001.md". `version` is 1-based. */
export function artifactVersionPath(slug: string, artifactType: string, version: number): string {
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`artifact version must be a positive integer, got ${version}`);
  }
  const v = String(version).padStart(VERSION_PAD, "0");
  return `${artifactDir(slug, artifactType)}/v${v}.md`;
}

export function artifactMetaPath(slug: string, artifactType: string): string {
  return `${artifactDir(slug, artifactType)}/meta.json`;
}

export function customTypePath(slug: string, customTypeId: string): string {
  return `${workspaceDir(slug)}/custom-types/${safeSegment(customTypeId)}.json`;
}

export function decompositionDir(slug: string): string {
  return `${workspaceDir(slug)}/decomposition`;
}

export function decompositionGraphLayoutPath(slug: string): string {
  return `${decompositionDir(slug)}/graph-layout.json`;
}
