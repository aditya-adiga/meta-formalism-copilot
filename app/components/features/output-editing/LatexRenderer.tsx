"use client";

import { useMemo } from "react";
import katex from "katex";

type Segment =
  | { type: "text"; content: string }
  | { type: "display"; content: string }
  | { type: "inline"; content: string };

/** Split text into alternating text / LaTeX segments.
 *  Handles $$...$$ (display) and $...$ (inline), in that order. */
function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  // Match $$...$$ first (display), then $...$ (inline)
  const re = /(\$\$[\s\S]*?\$\$|\$[^$\n]*?\$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith("$$")) {
      segments.push({ type: "display", content: raw.slice(2, -2) });
    } else {
      segments.push({ type: "inline", content: raw.slice(1, -1) });
    }
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }

  return segments;
}

function renderKatex(content: string, displayMode: boolean): string {
  try {
    return katex.renderToString(content, {
      displayMode,
      throwOnError: false,
      strict: false,
    });
  } catch {
    // Fallback to raw source if rendering fails
    return displayMode ? `$$${content}$$` : `$${content}$`;
  }
}

type LatexRendererProps = {
  value: string;
  className?: string;
};

export default function LatexRenderer({ value, className }: LatexRendererProps) {
  const segments = useMemo(() => parseSegments(value), [value]);

  if (!value) {
    return (
      <p
        className={`text-[#6B6560] ${className ?? ""}`}
        style={{ lineHeight: 1.9 }}
      >
        Processed output will appear here.
      </p>
    );
  }

  return (
    <div
      className={`text-[var(--ink-black)] ${className ?? ""}`}
      style={{ lineHeight: 1.9 }}
    >
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          // Preserve newlines as paragraph breaks
          return seg.content.split("\n").map((line, j, arr) => (
            <span key={`${i}-${j}`}>
              {line}
              {j < arr.length - 1 && <br />}
            </span>
          ));
        }
        if (seg.type === "display") {
          return (
            <div
              key={i}
              className="my-3 overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: renderKatex(seg.content, true) }}
            />
          );
        }
        // inline
        return (
          <span
            key={i}
            dangerouslySetInnerHTML={{ __html: renderKatex(seg.content, false) }}
          />
        );
      })}
    </div>
  );
}
