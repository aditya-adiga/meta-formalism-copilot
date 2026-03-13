import type { PropositionKind, PropositionNode } from "@/app/lib/types/decomposition";
import type { TextItem, TextStyle } from "pdfjs-dist/types/src/display/api";

// ── Types ──────────────────────────────────────────────────────────────────

/** A single span of text with font metadata, grouped from raw pdfjs TextItems. */
export type FontSpan = {
  text: string;
  fontFamily: string;
  isBold: boolean;
  isItalic: boolean;
};

/** A reconstructed line of text assembled from TextItems sharing the same Y-coordinate. */
export type Line = {
  text: string;
  spans: FontSpan[];
  /** Average Y-coordinate of the line (from transform[5]). */
  y: number;
  /** Page number (1-indexed). */
  page: number;
};

/** A proposition header identified from a line. */
export type HeaderMatch = {
  kind: PropositionKind;
  /** The number string, e.g. "1", "2.3". */
  number: string;
  /** Optional title text after the number, e.g. "(Cauchy–Schwarz)". */
  title: string;
  /** Index into the lines array. */
  lineIndex: number;
  /** Whether the header span was confirmed bold. */
  boldConfirmed: boolean;
};

/** A raw segment of the document between two headers. */
export type RawSegment = {
  kind: PropositionKind;
  number: string;
  title: string;
  /** The body text (statement) lines, joined. */
  body: string;
  /** The proof text, if a "Proof." block was found. */
  proofText: string;
  /** Header line index for ordering. */
  headerLineIndex: number;
};

/** Structured per-page data from pdfjs extraction. */
export type StructuredPage = {
  pageNumber: number;
  items: TextItem[];
  styles: Record<string, TextStyle>;
  annotations: AnnotationLink[];
};

/** A PDF link annotation extracted from hyperref-compiled documents. */
export type AnnotationLink = {
  /** Destination name or page reference. */
  dest: string | null;
  /** The visible text of the link (reconstructed from position). */
  rect: [number, number, number, number];
};

// ── Constants ──────────────────────────────────────────────────────────────

const KIND_MAP: Record<string, PropositionKind> = {
  theorem: "theorem",
  thm: "theorem",
  lemma: "lemma",
  lem: "lemma",
  definition: "definition",
  def: "definition",
  defn: "definition",
  proposition: "proposition",
  prop: "proposition",
  corollary: "corollary",
  cor: "corollary",
  axiom: "axiom",
  ax: "axiom",
};

const KIND_PREFIX: Partial<Record<PropositionKind, string>> = {
  definition: "def",
  lemma: "lem",
  theorem: "thm",
  proposition: "prop",
  corollary: "cor",
  axiom: "ax",
};

const KIND_LABEL: Partial<Record<PropositionKind, string>> = {
  definition: "Definition",
  lemma: "Lemma",
  theorem: "Theorem",
  proposition: "Proposition",
  corollary: "Corollary",
  axiom: "Axiom",
};

// Header pattern: "Theorem 1.2", "Lemma 3", "Def. 4", etc.
// Captures: [full match, kind word, number]
const HEADER_PATTERN =
  /^(Theorem|Lemma|Definition|Proposition|Corollary|Axiom|Thm|Lem|Def|Defn|Prop|Cor|Ax)\.?\s+(\d+(?:\.\d+)*)\s*[.:(]/i;

// Reference pattern in body text: "by Theorem 1", "from Lemma 2.3", "Thm. 1", etc.
const REFERENCE_PATTERN =
  /(?:by|from|using|see|cf\.?|via|in)\s+(Theorem|Lemma|Definition|Proposition|Corollary|Axiom|Thm|Lem|Def|Defn|Prop|Cor|Ax)\.?\s+(\d+(?:\.\d+)*)/gi;

// Direct reference pattern (no preceding preposition): "Theorem 1", "Lemma 2.3"
const DIRECT_REF_PATTERN =
  /(Theorem|Lemma|Definition|Proposition|Corollary|Axiom|Thm|Lem|Def|Defn|Prop|Cor|Ax)\.?\s+(\d+(?:\.\d+)*)/gi;

// ── Font classification ────────────────────────────────────────────────────

/**
 * Classify whether a font is bold based on fontFamily and fontName.
 * Handles standard patterns from Computer Modern, Times, etc.
 */
export function isBoldFont(fontFamily: string, fontName: string = ""): boolean {
  const combined = `${fontFamily} ${fontName}`.toLowerCase();
  return /bold|(?:^|\W)bx(?:\d|$|\W)|cmbx|cmb\d/.test(combined);
}

/**
 * Classify whether a font is italic based on fontFamily and fontName.
 * Handles standard patterns from Computer Modern, Times, etc.
 */
export function isItalicFont(fontFamily: string, fontName: string = ""): boolean {
  const combined = `${fontFamily} ${fontName}`.toLowerCase();
  return /italic|oblique|\bit\b|\bcmti|\bcmmi/.test(combined);
}

// ── Line reconstruction ────────────────────────────────────────────────────

/**
 * Y-coordinate tolerance for grouping text items into lines.
 * Items within this many units of the same Y are considered same line.
 */
const Y_TOLERANCE = 2;

/**
 * Group raw pdfjs TextItems into Lines by Y-coordinate.
 * Items within Y_TOLERANCE of each other are merged into a single line.
 */
export function reconstructLines(
  items: TextItem[],
  styles: Record<string, TextStyle>,
  pageNumber: number,
): Line[] {
  if (items.length === 0) return [];

  // Sort items by Y descending (PDF origin is bottom-left, so higher Y = higher on page)
  // then by X ascending (left to right) — transform[4] is X, transform[5] is Y
  const sorted = [...items].sort((a, b) => {
    const yDiff = b.transform[5] - a.transform[5];
    if (Math.abs(yDiff) > Y_TOLERANCE) return yDiff;
    return a.transform[4] - b.transform[4];
  });

  const lines: Line[] = [];
  let currentLineItems: TextItem[] = [sorted[0]];
  let currentY = sorted[0].transform[5];

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const itemY = item.transform[5];

    if (Math.abs(itemY - currentY) <= Y_TOLERANCE) {
      currentLineItems.push(item);
    } else {
      lines.push(buildLine(currentLineItems, styles, currentY, pageNumber));
      currentLineItems = [item];
      currentY = itemY;
    }
  }
  // Don't forget the last line
  lines.push(buildLine(currentLineItems, styles, currentY, pageNumber));

  return lines;
}

function buildLine(
  items: TextItem[],
  styles: Record<string, TextStyle>,
  y: number,
  pageNumber: number,
): Line {
  // Sort items left-to-right by X coordinate
  const sorted = [...items].sort((a, b) => a.transform[4] - b.transform[4]);

  const spans: FontSpan[] = [];
  let fullText = "";

  for (const item of sorted) {
    if (!item.str) continue;
    const style = styles[item.fontName];
    const fontFamily = style?.fontFamily ?? "";
    const bold = isBoldFont(fontFamily, item.fontName);
    const italic = isItalicFont(fontFamily, item.fontName);

    // Merge with previous span if same font style
    const prev = spans[spans.length - 1];
    if (prev && prev.isBold === bold && prev.isItalic === italic && prev.fontFamily === fontFamily) {
      prev.text += item.str;
    } else {
      spans.push({ text: item.str, fontFamily, isBold: bold, isItalic: italic });
    }
    fullText += item.str;
  }

  return { text: fullText.trim(), spans, y, page: pageNumber };
}

// ── Header identification ──────────────────────────────────────────────────

/**
 * Scan lines for proposition headers.
 * A header is confirmed by (1) matching the pattern and (2) the header prefix being in bold font.
 */
export function identifyPropositionHeaders(lines: Line[]): HeaderMatch[] {
  const headers: HeaderMatch[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = HEADER_PATTERN.exec(line.text);
    if (!match) continue;

    const kindWord = match[1].toLowerCase();
    const kind = KIND_MAP[kindWord];
    if (!kind) continue;

    const number = match[2];

    // Check if the header portion is bold
    const headerPrefix = match[1]; // e.g. "Theorem"
    const boldConfirmed = isHeaderBold(line.spans, headerPrefix);

    // Extract optional title: text in parentheses after the number
    let title = "";
    const titleMatch = line.text.match(
      new RegExp(`${match[2]}\\s*[.:]?\\s*\\(([^)]+)\\)`),
    );
    if (titleMatch) {
      title = titleMatch[1];
    }

    headers.push({ kind, number, title, lineIndex: i, boldConfirmed });
  }

  return headers;
}

/**
 * Check if the header keyword (e.g. "Theorem") appears in a bold span.
 */
function isHeaderBold(spans: FontSpan[], keyword: string): boolean {
  const lowerKeyword = keyword.toLowerCase();
  for (const span of spans) {
    if (span.text.toLowerCase().includes(lowerKeyword)) {
      return span.isBold;
    }
  }
  return false;
}

// ── Document segmentation ──────────────────────────────────────────────────

/**
 * Split lines into segments bounded by proposition headers.
 * Each segment captures body text and an optional proof block.
 */
export function segmentDocument(lines: Line[], headers: HeaderMatch[]): RawSegment[] {
  if (headers.length === 0) return [];

  const segments: RawSegment[] = [];

  for (let h = 0; h < headers.length; h++) {
    const header = headers[h];
    const startLine = header.lineIndex + 1; // body starts after header line
    const endLine = h + 1 < headers.length ? headers[h + 1].lineIndex : lines.length;

    // Collect body lines and detect proof blocks
    const bodyLines: string[] = [];
    const proofLines: string[] = [];
    let inProof = false;

    for (let i = startLine; i < endLine; i++) {
      const lineText = lines[i].text;

      // Detect proof start: line begins with "Proof" (possibly italic)
      if (!inProof && /^Proof\b/i.test(lineText)) {
        inProof = true;
        // Include the proof line itself (minus the "Proof." prefix if desired)
        const proofBody = lineText.replace(/^Proof\.?\s*/i, "").trim();
        if (proofBody) proofLines.push(proofBody);
        continue;
      }

      // Detect proof end: QED symbol □ or end of segment
      if (inProof) {
        // Check for QED marker — sometimes on its own line, sometimes ending a line
        const qedClean = lineText.replace(/□\s*$/, "").trim();
        if (qedClean) proofLines.push(qedClean);
        if (/□/.test(lineText)) {
          inProof = false;
        }
        continue;
      }

      // Skip empty lines at the start of body
      if (bodyLines.length === 0 && !lineText.trim()) continue;

      bodyLines.push(lineText);
    }

    // Also capture the header line's body content (text after the "Theorem 1." prefix)
    const headerLine = lines[header.lineIndex].text;
    const headerBodyMatch = headerLine.match(
      /^(?:Theorem|Lemma|Definition|Proposition|Corollary|Axiom|Thm|Lem|Def|Defn|Prop|Cor|Ax)\.?\s+\d+(?:\.\d+)*\s*[.:()]?\s*(?:\([^)]*\)\s*[.:]?\s*)?(.*)/i,
    );
    const headerBody = headerBodyMatch?.[1]?.trim() ?? "";

    const fullBody = [headerBody, ...bodyLines].filter(Boolean).join("\n").trim();

    segments.push({
      kind: header.kind,
      number: header.number,
      title: header.title,
      body: fullBody,
      proofText: proofLines.join("\n").trim(),
      headerLineIndex: header.lineIndex,
    });
  }

  return segments;
}

// ── Dependency extraction ──────────────────────────────────────────────────

/** Map of "kind-number" keys for looking up cross-references. */
type PropositionIndex = Map<string, string>; // "theorem-1" → node ID

/**
 * Build an index of proposition segments for cross-reference lookup.
 * Maps patterns like "theorem-1.2" → segment's generated node ID.
 */
function buildPropositionIndex(segments: RawSegment[]): PropositionIndex {
  const index: PropositionIndex = new Map();
  const counters: Partial<Record<PropositionKind, number>> = {
    definition: 0, lemma: 0, theorem: 0, proposition: 0, corollary: 0, axiom: 0,
  };

  for (const seg of segments) {
    counters[seg.kind] = (counters[seg.kind] ?? 0) + 1;
    const id = `${KIND_PREFIX[seg.kind]}-${counters[seg.kind]}`;

    // Index by kind + number (e.g. "theorem-1", "lemma-2.3")
    const kindNames = Object.entries(KIND_MAP)
      .filter(([, v]) => v === seg.kind)
      .map(([k]) => k);
    for (const name of kindNames) {
      index.set(`${name}-${seg.number}`, id);
    }
    // Also index by just the number for unambiguous references
    index.set(`${seg.kind}-${seg.number}`, id);
  }

  return index;
}

/**
 * Extract dependency edges from body and proof text using regex reference matching.
 */
export function extractDependencies(
  segments: RawSegment[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for future annotation-based dependency extraction
  _annotations: AnnotationLink[] = [],
): Map<number, string[]> {
  const index = buildPropositionIndex(segments);
  const deps = new Map<number, string[]>();

  const counters: Partial<Record<PropositionKind, number>> = {
    definition: 0, lemma: 0, theorem: 0, proposition: 0, corollary: 0, axiom: 0,
  };

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    counters[seg.kind] = (counters[seg.kind] ?? 0) + 1;
    const selfId = `${KIND_PREFIX[seg.kind]}-${counters[seg.kind]}`;

    const allText = `${seg.body}\n${seg.proofText}`;
    const found = new Set<string>();

    // Scan for references
    for (const pattern of [REFERENCE_PATTERN, DIRECT_REF_PATTERN]) {
      pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(allText)) !== null) {
        const refKind = m[1].toLowerCase();
        const refNumber = m[2];
        // Look up in index
        const targetId = index.get(`${refKind}-${refNumber}`);
        if (targetId && targetId !== selfId) {
          found.add(targetId);
        }
      }
    }

    deps.set(i, Array.from(found));
  }

  return deps;
}

// ── Detection heuristic ────────────────────────────────────────────────────

/**
 * Returns true if the PDF appears to be TeX-compiled with structured propositions.
 * Requires ≥2 bold-confirmed proposition headers.
 */
export function isPdfTexCompiled(lines: Line[]): boolean {
  const headers = identifyPropositionHeaders(lines);
  const boldHeaders = headers.filter((h) => h.boldConfirmed);
  return boldHeaders.length >= 2;
}

// ── Structured extraction from pdfjs ───────────────────────────────────────

/**
 * Extract structured per-page data from a PDF file using pdfjs-dist.
 * Returns text items with font metadata and link annotations.
 */
export async function extractStructuredItems(file: File): Promise<StructuredPage[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const pagePromises = Array.from({ length: pdf.numPages }, async (_, idx) => {
    const i = idx + 1;
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Extract text items (filter out marked content)
    const items = content.items.filter(
      (item): item is TextItem => "str" in item,
    );

    // Extract link annotations (from hyperref)
    const annotations: AnnotationLink[] = [];
    try {
      const rawAnnotations = await page.getAnnotations();
      for (const ann of rawAnnotations) {
        if (ann.subtype === "Link" && ann.rect) {
          annotations.push({
            dest: ann.dest ?? null,
            rect: ann.rect as [number, number, number, number],
          });
        }
      }
    } catch {
      // Some PDFs may fail annotation extraction; continue without them
    }

    return {
      pageNumber: i,
      items,
      styles: content.styles as Record<string, TextStyle>,
      annotations,
    } satisfies StructuredPage;
  });

  return Promise.all(pagePromises);
}

// ── Top-level parser ───────────────────────────────────────────────────────

/**
 * Parse a TeX-compiled PDF into PropositionNodes.
 * Returns null if the PDF doesn't appear to be a structured math document.
 */
export async function parsePdfPropositions(
  file: File,
  source?: { sourceId: string; sourceLabel: string },
): Promise<PropositionNode[] | null> {
  const pages = await extractStructuredItems(file);

  // Reconstruct lines across all pages
  const allLines: Line[] = [];
  const allAnnotations: AnnotationLink[] = [];
  for (const page of pages) {
    const lines = reconstructLines(page.items, page.styles, page.pageNumber);
    allLines.push(...lines);
    allAnnotations.push(...page.annotations);
  }

  // Identify headers — also used as the TeX-compiled detection heuristic
  const headers = identifyPropositionHeaders(allLines);
  const boldHeaders = headers.filter((h) => h.boldConfirmed);
  if (boldHeaders.length < 2) {
    return null;
  }
  const segments = segmentDocument(allLines, headers);

  if (segments.length === 0) return null;

  // Extract dependencies
  const deps = extractDependencies(segments, allAnnotations);

  // Build PropositionNodes
  const counters: Partial<Record<PropositionKind, number>> = {
    definition: 0, lemma: 0, theorem: 0, proposition: 0, corollary: 0, axiom: 0,
  };

  const nodes: PropositionNode[] = segments.map((seg, i) => {
    counters[seg.kind] = (counters[seg.kind] ?? 0) + 1;
    const num = counters[seg.kind];
    const id = `${KIND_PREFIX[seg.kind]}-${num}`;
    const titleSuffix = seg.title ? ` (${seg.title})` : "";
    const label = `${KIND_LABEL[seg.kind]} ${num}${titleSuffix}`;

    return {
      id,
      label,
      kind: seg.kind,
      statement: seg.body,
      proofText: seg.proofText,
      dependsOn: deps.get(i) ?? [],
      sourceId: source?.sourceId ?? "",
      sourceLabel: source?.sourceLabel ?? "",
      semiformalProof: "",
      leanCode: "",
      verificationStatus: "unverified" as const,
      verificationErrors: "",
      context: "",
      selectedArtifactTypes: [],
      artifacts: [],
    };
  });

  return nodes;
}
