"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];

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
      className={`text-[var(--ink-black)] prose prose-neutral max-w-none prose-headings:font-serif prose-p:my-2 prose-table:border-collapse prose-th:border prose-th:border-[var(--border-light)] prose-th:px-3 prose-th:py-1.5 prose-td:border prose-td:border-[var(--border-light)] prose-td:px-3 prose-td:py-1.5 ${className ?? ""}`}
      style={{ lineHeight: 1.9, fontFamily: "inherit" }}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}
