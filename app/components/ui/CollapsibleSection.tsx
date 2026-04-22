"use client";

import { useState, type ReactNode } from "react";

type CollapsibleSectionProps = {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  variant?: "default" | "error";
  children: ReactNode;
};

const HIDDEN_STYLE = { display: "none" } as const;

const VARIANT_CLASSES = {
  default: "text-[#6B6560]",
  error: "text-red-800",
} as const;

export default function CollapsibleSection({
  title,
  count,
  defaultOpen = true,
  variant = "default",
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-1.5 mb-2 select-none text-xs font-semibold uppercase tracking-wide ${VARIANT_CLASSES[variant]}`}
        aria-expanded={open}
      >
        <svg
          className={`h-3 w-3 shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
          viewBox="0 0 12 12"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M4.5 2l5 4-5 4V2z" />
        </svg>
        <span>
          {title}
          {count !== undefined && ` (${count})`}
        </span>
      </button>
      {/* Always render children to preserve internal state (e.g. editable fields) */}
      <div style={open ? undefined : HIDDEN_STYLE}>{children}</div>
    </section>
  );
}
