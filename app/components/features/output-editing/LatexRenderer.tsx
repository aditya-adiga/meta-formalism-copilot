"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

type LatexRendererProps = {
  value: string;
  className?: string;
};

export default function LatexRenderer({ value, className }: LatexRendererProps) {
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
      className={`text-[var(--ink-black)] prose prose-neutral max-w-none prose-headings:font-serif prose-p:my-2 ${className ?? ""}`}
      style={{ lineHeight: 1.9, fontFamily: "inherit" }}
    >
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {value}
      </ReactMarkdown>
    </div>
  );
}
