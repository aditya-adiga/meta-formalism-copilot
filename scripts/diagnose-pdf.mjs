/**
 * Diagnostic script: run the pdfPropositionParser pipeline on a real PDF
 * and log intermediate results to identify where parsing fails.
 *
 * Usage: node scripts/diagnose-pdf.mjs data/Notes_05_15_Final.pdf
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// ── Inline the pure functions from pdfPropositionParser ──────────────────
// (We can't import .ts directly in Node without a build step)

const Y_TOLERANCE = 2;

function isBoldFont(fontFamily, fontName = "") {
  const combined = `${fontFamily} ${fontName}`.toLowerCase();
  return /bold|(?:^|\W)bx(?:\d|$|\W)|cmbx|cmb\d/.test(combined);
}

function isItalicFont(fontFamily, fontName = "") {
  const combined = `${fontFamily} ${fontName}`.toLowerCase();
  return /italic|oblique|\bit\b|\bcmti|\bcmmi/.test(combined);
}

function buildLine(items, styles, y, pageNumber) {
  const sorted = [...items].sort((a, b) => a.transform[4] - b.transform[4]);
  const spans = [];
  let fullText = "";

  for (const item of sorted) {
    if (!item.str) continue;
    const style = styles[item.fontName];
    const fontFamily = style?.fontFamily ?? "";
    const bold = isBoldFont(fontFamily, item.fontName);
    const italic = isItalicFont(fontFamily, item.fontName);

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

function reconstructLines(items, styles, pageNumber) {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => {
    const yDiff = b.transform[5] - a.transform[5];
    if (Math.abs(yDiff) > Y_TOLERANCE) return yDiff;
    return a.transform[4] - b.transform[4];
  });

  const lines = [];
  let currentLineItems = [sorted[0]];
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
  lines.push(buildLine(currentLineItems, styles, currentY, pageNumber));
  return lines;
}

const HEADER_PATTERN =
  /^(Theorem|Lemma|Definition|Proposition|Corollary|Axiom|Thm|Lem|Def|Defn|Prop|Cor|Ax)\.?\s+(\d+(?:\.\d+)*)(?=[.:\s(])/i;

function identifyPropositionHeaders(lines) {
  const KIND_MAP = {
    theorem: "theorem", thm: "theorem",
    lemma: "lemma", lem: "lemma",
    definition: "definition", def: "definition", defn: "definition",
    proposition: "proposition", prop: "proposition",
    corollary: "corollary", cor: "corollary",
    axiom: "axiom", ax: "axiom",
  };

  const headers = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = HEADER_PATTERN.exec(line.text);
    if (!match) continue;

    const kindWord = match[1].toLowerCase();
    const kind = KIND_MAP[kindWord];
    if (!kind) continue;

    const headerPrefix = match[1];
    const lowerKeyword = headerPrefix.toLowerCase();
    let boldConfirmed = false;
    for (const span of line.spans) {
      if (span.text.toLowerCase().includes(lowerKeyword)) {
        boldConfirmed = span.isBold;
        break;
      }
    }

    headers.push({ kind, number: match[2], lineIndex: i, boldConfirmed, lineText: line.text.slice(0, 80) });
  }
  return headers;
}

// ── Main ─────────────────────────────────────────────────────────────────

const pdfPath = resolve(process.argv[2] || "data/Notes_05_15_Final.pdf");
console.log(`\n📄 Loading PDF: ${pdfPath}\n`);

const data = new Uint8Array(readFileSync(pdfPath));
const pdf = await getDocument({ data }).promise;
console.log(`Pages: ${pdf.numPages}\n`);

const allLines = [];
const allFontNames = new Set();
const allStyles = {};

for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const content = await page.getTextContent();
  const items = content.items.filter((item) => "str" in item);

  // Collect unique font info
  for (const item of items) {
    allFontNames.add(item.fontName);
  }
  Object.assign(allStyles, content.styles);

  const lines = reconstructLines(items, content.styles, i);
  allLines.push(...lines);
}

// ── Report: Font inventory ──────────────────────────────────────────────
console.log("═══ FONT INVENTORY ═══");
for (const fontName of [...allFontNames].sort()) {
  const style = allStyles[fontName];
  const family = style?.fontFamily ?? "(no family)";
  const bold = isBoldFont(family, fontName);
  const italic = isItalicFont(family, fontName);
  console.log(`  ${fontName} → family="${family}" bold=${bold} italic=${italic}`);
}

// ── Report: First 50 lines ──────────────────────────────────────────────
console.log(`\n═══ FIRST 50 LINES (of ${allLines.length} total) ═══`);
for (let i = 0; i < Math.min(50, allLines.length); i++) {
  const l = allLines[i];
  const spanInfo = l.spans.map((s) => `[${s.isBold ? "B" : ""}${s.isItalic ? "I" : ""}${!s.isBold && !s.isItalic ? "N" : ""} "${s.text.slice(0, 40)}${s.text.length > 40 ? "..." : ""}" font=${s.fontFamily}]`).join(" ");
  console.log(`  L${i} p${l.page}: "${l.text.slice(0, 80)}${l.text.length > 80 ? "..." : ""}"`);
  console.log(`         ${spanInfo}`);
}

// ── Report: Lines that look like proposition headers ────────────────────
console.log(`\n═══ HEADER REGEX MATCHES ═══`);
const headerPattern = /^(Theorem|Lemma|Definition|Proposition|Corollary|Axiom|Thm|Lem|Def|Defn|Prop|Cor|Ax)\.?\s+(\d+(?:\.\d+)*)/i;
let potentialHeaders = 0;
for (let i = 0; i < allLines.length; i++) {
  const m = headerPattern.exec(allLines[i].text);
  if (m) {
    potentialHeaders++;
    const fullMatch = HEADER_PATTERN.exec(allLines[i].text);
    const endCharOk = fullMatch ? "YES" : "NO (missing ./:/(  after number)";
    console.log(`  L${i} p${allLines[i].page}: "${allLines[i].text.slice(0, 80)}" → end-char-ok=${endCharOk}`);
  }
}
console.log(`  Total potential headers: ${potentialHeaders}`);

// ── Report: Full header identification ──────────────────────────────────
console.log(`\n═══ IDENTIFIED PROPOSITION HEADERS ═══`);
const headers = identifyPropositionHeaders(allLines);
for (const h of headers) {
  console.log(`  ${h.kind} ${h.number} bold=${h.boldConfirmed} line=${h.lineIndex} "${h.lineText}"`);
}
const boldCount = headers.filter((h) => h.boldConfirmed).length;
console.log(`\n  Total headers: ${headers.length}`);
console.log(`  Bold-confirmed: ${boldCount}`);
console.log(`  Would pass isPdfTexCompiled: ${boldCount >= 2 || headers.length >= 3 ? "YES ✅" : "NO ❌ (need ≥2 bold or ≥3 total)"}`);
