"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import PaperClipIcon from "@/app/components/ui/icons/PaperClipIcon";
import { extractTextFromFile } from "@/app/lib/utils/fileExtraction";

const ACCEPT = ".txt,.md,.markdown,.tex,.docx,application/pdf";

type FileStatus = "extracting" | "ready" | "error";

type TrackedFile = {
  file: File;
  status: FileStatus;
  text: string;
  error?: string;
};

type FileUploadProps = {
  onFilesChanged?: (files: { name: string; text: string; file?: File }[]) => void;
  /** Previously extracted files to display on mount (e.g. restored from persistence) */
  existingFiles?: { name: string; text: string }[];
};

export default function FileUpload({ onFilesChanged, existingFiles }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Seed trackedFiles from existingFiles on mount. These entries lack a File object
  // (it can't be serialized) but still show the user what was previously uploaded.
  const [trackedFiles, setTrackedFiles] = useState<TrackedFile[]>(() =>
    (existingFiles ?? []).map((f) => ({
      file: new File([], f.name), // placeholder — original File can't be persisted
      status: "ready" as const,
      text: f.text,
    })),
  );

  // Track whether we're still on the initial render to avoid notifying parent
  // with the same files it already has.
  const isInitialMount = useRef(true);

  // Notify parent whenever ready files change (skip the initial mount
  // when we're just restoring existingFiles the parent already knows about)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const readyFiles = trackedFiles
      .filter((f) => f.status === "ready")
      .map((f) => ({ name: f.file.name, text: f.text, file: f.file }));
    onFilesChanged?.(readyFiles);
  }, [trackedFiles, onFilesChanged]);

  const processFile = useCallback(async (file: File, index: number) => {
    try {
      const text = await extractTextFromFile(file);
      setTrackedFiles((prev) =>
        prev.map((tf, i) => (i === index ? { ...tf, status: "ready" as const, text } : tf)),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Extraction failed";
      setTrackedFiles((prev) =>
        prev.map((tf, i) =>
          i === index ? { ...tf, status: "error" as const, error: msg } : tf,
        ),
      );
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;

    const newFiles: TrackedFile[] = Array.from(selected).map((file) => ({
      file,
      status: "extracting" as const,
      text: "",
    }));

    setTrackedFiles((prev) => {
      const startIndex = prev.length;
      // Kick off extraction for each new file
      newFiles.forEach((tf, i) => processFile(tf.file, startIndex + i));
      return [...prev, ...newFiles];
    });

    // Reset input so the same file can be re-selected
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleClick = () => inputRef.current?.click();

  const handleRemove = (index: number) => {
    setTrackedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-2">
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
        <span>Upload documents (.txt, .md, .tex, .docx, .pdf)</span>
      </button>
      {trackedFiles.length > 0 && (
        <ul className="mt-2 space-y-1">
          {trackedFiles.map((tf, index) => (
            <li
              key={`${tf.file.name}-${index}`}
              className="flex items-center justify-between gap-2 rounded-md border border-[#E8E4E0] bg-white px-3 py-2 text-sm text-[var(--ink-black)] shadow-sm"
            >
              <span className="flex items-center gap-2 truncate">
                <StatusIndicator status={tf.status} />
                <span className="truncate">{tf.file.name}</span>
                {tf.status === "ready" && (
                  <span className="ml-auto shrink-0 text-[10px] text-[#9A9590]">
                    {tf.text.length.toLocaleString()} chars
                  </span>
                )}
                {tf.status === "error" && tf.error && (
                  <span className="text-xs text-red-600" title={tf.error}>
                    — {tf.error}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="shrink-0 text-[#9A9590] hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1"
                aria-label={`Remove ${tf.file.name}`}
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

function StatusIndicator({ status }: { status: FileStatus }) {
  switch (status) {
    case "extracting":
      return (
        <span
          className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#9A9590] border-t-transparent"
          role="status"
          aria-label="Extracting text"
        />
      );
    case "ready":
      return (
        <span className="text-green-600" aria-label="Ready">
          ✓
        </span>
      );
    case "error":
      return (
        <span className="text-red-600" aria-label="Error">
          ✗
        </span>
      );
  }
}
