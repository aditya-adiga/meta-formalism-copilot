/** Utilities for working with the OpenAlex API.
 *
 * OpenAlex stores abstracts as inverted indexes (word → position[]) rather
 * than plain text. reconstructAbstract handles this conversion. */

import type { EvidencePaper } from "@/app/lib/types/evidence";

/** Reconstruct plain-text abstract from OpenAlex's inverted index format.
 *  Each key is a word, each value is an array of 0-based positions. */
export function reconstructAbstract(
  invertedIndex: Record<string, number[]> | null | undefined,
): string | null {
  if (!invertedIndex || typeof invertedIndex !== "object") return null;

  const entries = Object.entries(invertedIndex);
  if (entries.length === 0) return null;

  // Build a position → word array
  const words: string[] = [];
  for (const [word, positions] of entries) {
    if (!Array.isArray(positions)) continue;
    for (const pos of positions) {
      if (typeof pos === "number" && pos >= 0) {
        words[pos] = word;
      }
    }
  }

  // Join, handling any sparse gaps
  return words.filter((w) => w !== undefined).join(" ") || null;
}

// -- OpenAlex response types (subset of fields we use) -----------------------

type OpenAlexAuthorship = {
  author?: { display_name?: string };
};

type OpenAlexSource = {
  display_name?: string;
};

type OpenAlexLocation = {
  source?: OpenAlexSource | null;
};

type OpenAlexOpenAccess = {
  oa_url?: string | null;
};

export type OpenAlexWork = {
  id?: string;
  title?: string;
  authorships?: OpenAlexAuthorship[];
  publication_year?: number | null;
  cited_by_count?: number;
  abstract_inverted_index?: Record<string, number[]> | null;
  primary_location?: OpenAlexLocation | null;
  open_access?: OpenAlexOpenAccess | null;
  doi?: string | null;
  relevance_score?: number | null;
  /** List of OpenAlex Work IDs this paper cites (full URLs like "https://openalex.org/W123") */
  referenced_works?: string[];
};

/** Map a raw OpenAlex work object to our EvidencePaper type. */
export function mapOpenAlexWork(work: OpenAlexWork): EvidencePaper {
  const authors = (work.authorships ?? [])
    .map((a) => a.author?.display_name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);

  return {
    openAlexId: work.id ?? "",
    title: work.title ?? "(untitled)",
    authors,
    year: work.publication_year ?? null,
    abstract: reconstructAbstract(work.abstract_inverted_index),
    citedByCount: work.cited_by_count ?? 0,
    journal: work.primary_location?.source?.display_name ?? null,
    doi: work.doi ?? null,
    oaUrl: work.open_access?.oa_url ?? null,
    reliability: null,
    relatedness: null,
  };
}

// ---------------------------------------------------------------------------
// Batch fetch by ID (for overlap detection — retrieves referenced_works)
// ---------------------------------------------------------------------------

const OPENALEX_API_URL = "https://api.openalex.org/works";
const FETCH_BY_ID_TIMEOUT_MS = 10_000;

/** Batch-fetch OpenAlex works by ID, returning only `id` and `referenced_works`.
 *  Uses the pipe-separated filter syntax: `filter=openalex:W123|W456`.
 *  OpenAlex supports up to 50 IDs per request. */
export async function fetchWorksByIds(
  ids: string[],
  mailto: string,
): Promise<OpenAlexWork[]> {
  if (ids.length === 0) return [];

  // Strip full URL prefix if present — OpenAlex filter wants bare IDs like "W123"
  const shortIds = ids.map((id) =>
    id.replace("https://openalex.org/", ""),
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_BY_ID_TIMEOUT_MS);

  try {
    const url = new URL(OPENALEX_API_URL);
    url.searchParams.set("filter", `openalex:${shortIds.join("|")}`);
    url.searchParams.set("select", "id,referenced_works");
    url.searchParams.set("per_page", String(ids.length));
    url.searchParams.set("mailto", mailto);

    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[openAlexUtils] fetchWorksByIds returned ${res.status}`);
      return [];
    }

    const data = await res.json();
    return (data.results ?? []) as OpenAlexWork[];
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[openAlexUtils] fetchWorksByIds timeout");
    } else {
      console.error("[openAlexUtils] fetchWorksByIds error:", err);
    }
    return [];
  }
}

/** Deduplicate papers by openAlexId, keeping the first occurrence. */
export function deduplicatePapers(papers: EvidencePaper[]): EvidencePaper[] {
  const seen = new Set<string>();
  return papers.filter((p) => {
    if (!p.openAlexId || seen.has(p.openAlexId)) return false;
    seen.add(p.openAlexId);
    return true;
  });
}
