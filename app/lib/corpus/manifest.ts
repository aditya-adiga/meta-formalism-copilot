/**
 * `workspace.json` manifest schema + codec (DD-009 sub-task S0).
 *
 * The manifest is the index for one workspace folder: it lists the sources, the
 * current-version pointer per artifact type, and the custom-type ids present.
 * The per-version artifact bytes live in files (artifacts/<type>/v####.md), not
 * here — the manifest only points at the current version so a consumer can open
 * a workspace without scanning every file.
 *
 * Codec contract (arch-review / test-strategy G11): parsing is FAIL-LOUD for
 * content. A malformed or absent manifest surfaces as a typed `CorpusError` of
 * kind "io", never a silent default-empty manifest that would masquerade as
 * "this workspace has no work in it" and mask data loss. The only fields that
 * default rather than fail are the `createdAt`/`updatedAt` timestamps (metadata,
 * not content) — every content field (title, sources, artifacts, customArtifactTypeIds)
 * fails loud if missing or malformed.
 */

import { CorpusError } from "./types";

export const MANIFEST_VERSION = 1;

/** Pointer to the current version of one artifact type. `currentVersion` is the
 *  1-based version number whose file is artifacts/<type>/v####.md. */
export interface ArtifactPointer {
  type: string;
  currentVersion: number;
}

export interface SourceRef {
  id: string;
  label: string;
  /** File extension (no dot) of the stored source bytes under sources/. */
  ext: string;
}

export interface WorkspaceManifest {
  manifestVersion: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  sources: SourceRef[];
  artifacts: ArtifactPointer[];
  customArtifactTypeIds: string[];
}

export function createManifest(title: string, now = new Date().toISOString()): WorkspaceManifest {
  return {
    manifestVersion: MANIFEST_VERSION,
    title,
    createdAt: now,
    updatedAt: now,
    sources: [],
    artifacts: [],
    customArtifactTypeIds: [],
  };
}

export function serializeManifest(m: WorkspaceManifest): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(m, null, 2));
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fail(reason: string): never {
  // Manifest parse failure is an i/o-class corruption of the workspace index.
  throw new CorpusError({ kind: "io", path: "workspace.json", reason }, `invalid workspace.json: ${reason}`);
}

/**
 * Parse + validate manifest bytes. Throws a `CorpusError` on any malformation —
 * a `null` input (file absent) is the caller's responsibility to detect via
 * `CorpusFS.readFile` returning `null`; passing `null` here is itself an error.
 */
export function parseManifest(bytes: Uint8Array | null): WorkspaceManifest {
  if (bytes === null) fail("manifest file is absent");
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    fail(`not valid JSON (${(e as Error).message})`);
  }
  if (!isObject(raw)) fail("top-level value is not an object");
  if (typeof raw.title !== "string") fail("missing required field: title");
  if (typeof raw.manifestVersion !== "number") fail("missing required field: manifestVersion");

  const sources: SourceRef[] = Array.isArray(raw.sources)
    ? raw.sources.filter(isObject).map((s) => {
        if (typeof s.id !== "string" || typeof s.ext !== "string") fail("source entry missing id/ext");
        return { id: s.id, label: typeof s.label === "string" ? s.label : s.id, ext: s.ext };
      })
    : fail("missing or invalid field: sources");

  const artifacts: ArtifactPointer[] = Array.isArray(raw.artifacts)
    ? raw.artifacts.filter(isObject).map((a) => {
        if (typeof a.type !== "string" || typeof a.currentVersion !== "number") {
          fail("artifact pointer missing type/currentVersion");
        }
        return { type: a.type as string, currentVersion: a.currentVersion as number };
      })
    : fail("missing or invalid field: artifacts");

  const customArtifactTypeIds: string[] = Array.isArray(raw.customArtifactTypeIds)
    ? raw.customArtifactTypeIds.filter((x): x is string => typeof x === "string")
    : fail("missing or invalid field: customArtifactTypeIds");

  return {
    manifestVersion: raw.manifestVersion,
    title: raw.title,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    sources,
    artifacts,
    customArtifactTypeIds,
  };
}
