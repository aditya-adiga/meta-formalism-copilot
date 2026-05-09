/**
 * Graph image export utilities. Separated for code-splitting since
 * html-to-image is only needed when exporting the React Flow graph.
 */

// Use toBlob (not toPng + fetch) so we don't need `data:` in CSP connect-src.
import { toBlob } from "html-to-image";
import { triggerDownload } from "./export";

/** Query the React Flow viewport element from the DOM */
export function getGraphViewportElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".react-flow__viewport");
}

const EXPORT_BG = "#F9F5F1"; // --ivory-cream

async function renderGraphPng(viewportElement: HTMLElement): Promise<Blob> {
  const blob = await toBlob(viewportElement, {
    pixelRatio: 2,
    backgroundColor: EXPORT_BG,
  });
  if (!blob) throw new Error("Failed to render graph PNG");
  return blob;
}

export async function downloadGraphAsPng(
  viewportElement: HTMLElement,
  filename = "proof-graph.png",
) {
  triggerDownload(await renderGraphPng(viewportElement), filename);
}

/** Generate a PNG blob of the graph (for embedding in zip) */
export function graphToPngBlob(viewportElement: HTMLElement): Promise<Blob> {
  return renderGraphPng(viewportElement);
}
