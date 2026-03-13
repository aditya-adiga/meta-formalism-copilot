/**
 * Core export utilities for downloading workspace artifacts as files.
 * Uses native Blob + createObjectURL for zero-dependency text downloads.
 */

/** Create a temporary <a> element, click it, and clean up */
export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  // Defer cleanup so the browser has time to start the download
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 100);
}

export function downloadTextFile(content: string, filename: string, mimeType = "text/plain") {
  const blob = new Blob([content], { type: mimeType });
  triggerDownload(blob, filename);
}

export function downloadSemiformalAsMarkdown(text: string, filename = "semiformal-proof.md") {
  downloadTextFile(text, filename, "text/markdown");
}

export function downloadLeanCode(code: string, filename = "proof.lean") {
  downloadTextFile(code, filename, "text/plain");
}

/** Strip characters unsafe for filenames, collapse whitespace to hyphens */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 60) || "untitled";
}
