/**
 * Graph image export utilities. Separated for code-splitting since
 * html-to-image is only needed when exporting the React Flow graph.
 */

import { toPng } from "html-to-image";
import { triggerDownload } from "./export";

/** Query the React Flow viewport element from the DOM */
export function getGraphViewportElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".react-flow__viewport");
}

const EXPORT_BG = "#F9F5F1"; // --ivory-cream

export async function downloadGraphAsPng(
  viewportElement: HTMLElement,
  filename = "proof-graph.png",
) {
  const dataUrl = await toPng(viewportElement, {
    pixelRatio: 2,
    backgroundColor: EXPORT_BG,
  });
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  triggerDownload(blob, filename);
}

/** Generate a PNG blob of the graph (for embedding in zip) */
export async function graphToPngBlob(
  viewportElement: HTMLElement,
): Promise<Blob> {
  const dataUrl = await toPng(viewportElement, {
    pixelRatio: 2,
    backgroundColor: EXPORT_BG,
  });
  const res = await fetch(dataUrl);
  return res.blob();
}
