"use client";

type DownloadButtonProps = {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  title?: string;
};

/** Small download button matching panel header secondary button styling */
export default function DownloadButton({ onClick, label, disabled, title }: DownloadButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className="inline-flex items-center gap-1.5 rounded-md border border-[#DDD9D5] bg-[var(--ivory-cream)] px-2.5 py-1 text-xs text-[#6B6560] transition-colors hover:shadow-md hover:text-[var(--ink-black)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-black)] disabled:opacity-40 disabled:pointer-events-none"
    >
      {/* Download arrow icon */}
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 1.5v7M3 6.5l3 3 3-3" />
        <path d="M1.5 10.5h9" />
      </svg>
      {label}
    </button>
  );
}
