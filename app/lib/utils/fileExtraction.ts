import type { TextItem } from "pdfjs-dist/types/src/display/api";

/**
 * Sanitize text extracted from PDFs for safe JSON serialization.
 * LaTeX-generated PDFs often contain ligatures, non-standard font mappings,
 * and control characters that break JSON.stringify.
 */
export function sanitizeText(raw: string): string {
  return (
    raw
      // Normalize ligatures and diacritics (e.g. ﬁ → fi, ﬂ → fl)
      .normalize("NFKC")
      // Strip control characters except newline and tab
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      .trim()
  );
}

/**
 * Lazy-load pdfjs-dist so it only runs in the browser (avoids DOMMatrix
 * errors during Next.js SSR/prerendering).
 */
async function getPdfjs() {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  return pdfjsLib;
}

/** Extract text from a PDF file using pdfjs-dist, page by page. */
export async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjsLib = await getPdfjs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .filter((item): item is TextItem => "str" in item)
      .map((item) => item.str)
      .join(" ");
    pages.push(text);
  }

  return sanitizeText(pages.join("\n"));
}

/** Extract text from a plain text file using FileReader. */
export async function extractTextFromTxt(file: File): Promise<string> {
  const text = await file.text();
  return sanitizeText(text);
}

/** Dispatch text extraction based on file extension. */
export async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "pdf":
      return extractTextFromPDF(file);
    case "txt":
      return extractTextFromTxt(file);
    case "doc":
    case "docx":
      throw new Error(
        `.${ext} support is not yet implemented. Please convert to PDF or .txt.`,
      );
    default:
      throw new Error(`Unsupported file type: .${ext ?? "(unknown)"}`);
  }
}
