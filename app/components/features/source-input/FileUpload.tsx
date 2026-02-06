"use client";

import { useRef, useState } from "react";
import PaperClipIcon from "@/app/components/ui/icons/PaperClipIcon";

const ACCEPT = ".txt,.doc,.docx,application/pdf";

export default function FileUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (selected) {
      setFiles((prev) => [...prev, ...Array.from(selected)]);
    }
  };

  const handleClick = () => inputRef.current?.click();

  const handleRemove = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-[#6B6560]">
        Upload papers, notes, or reference materials
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        onChange={handleChange}
        className="hidden"
        aria-label="Choose files"
      />
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex w-fit items-center gap-2 rounded-md border border-[#DDD9D5] bg-[var(--ivory-cream)] px-3 py-2 text-sm font-medium text-[var(--ink-black)] shadow-md transition-shadow duration-200 hover:shadow-lg active:shadow-xl focus:outline-none focus:ring-2 focus:ring-[var(--ink-black)] focus:ring-offset-2 focus:ring-offset-[var(--ivory-cream)]"
      >
        <PaperClipIcon />
        <span>.txt, .doc, .docx, .pdf</span>
      </button>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f, index) => (
            <li
              key={`${f.name}-${index}`}
              className="flex items-center justify-between gap-2 rounded-md border border-[#E8E4E0] bg-white px-3 py-2 text-sm text-[var(--ink-black)] shadow-sm"
            >
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="shrink-0 text-[#9A9590] hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1"
                aria-label={`Remove ${f.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
