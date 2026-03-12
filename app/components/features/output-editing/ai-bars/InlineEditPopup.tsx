"use client";

import { useRef, useState, useEffect } from "react";
import SendIcon from "@/app/components/ui/icons/SendIcon";

type InlineEditPopupProps = {
  onApply: (instruction: string) => void;
  onClose: () => void;
  selectedText: string;
  position?: { top: number; left: number };
};

export default function InlineEditPopup({
  onApply,
  onClose,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  selectedText,
  position,
}: InlineEditPopupProps) {
  const [instruction, setInstruction] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleSubmit = () => {
    onApply(instruction);
    setInstruction("");
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const style: React.CSSProperties = position
    ? { position: "absolute", top: position.top, left: position.left, zIndex: 50 }
    : {};

  return (
    <div
      className="transition-opacity duration-200"
      style={style}
      role="dialog"
      aria-label="Edit selection with AI"
    >
      <div className="flex items-center gap-2 rounded-full bg-[var(--ink-black)] px-4 py-2.5 shadow-xl">
        <input
          ref={inputRef}
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Edit this selection..."
          className="min-w-[200px] max-w-[320px] flex-1 bg-transparent text-sm text-white placeholder-white/70 focus:outline-none"
          aria-label="Edit instruction"
        />
        <button
          type="button"
          onClick={handleSubmit}
          className="flex shrink-0 items-center justify-center text-white/90 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-[var(--ink-black)] rounded-full p-1"
          aria-label="Apply edit"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );
}
