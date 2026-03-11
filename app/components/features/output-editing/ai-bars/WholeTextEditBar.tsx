"use client";

import { useRef, useState } from "react";
import SendIcon from "@/app/components/ui/icons/SendIcon";

type WholeTextEditBarProps = {
  onApply: (instruction: string) => void;
};

export default function WholeTextEditBar({ onApply }: WholeTextEditBarProps) {
  const [instruction, setInstruction] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (instruction.trim()) {
      onApply(instruction);
      setInstruction("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="shrink-0 border-t border-[#DDD9D5] px-4 py-3">
      <div className="flex items-center gap-2 rounded-full bg-[var(--ink-black)] px-4 py-2.5 shadow-md">
        <input
          ref={inputRef}
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Make changes to entire output... e.g., make it more concise"
          className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-white/60 focus:outline-none"
          aria-label="Edit entire output instruction"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!instruction.trim()}
          className="flex shrink-0 items-center justify-center text-white/90 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-[var(--ink-black)] disabled:opacity-40 rounded-full p-1.5"
          aria-label="Apply edit to entire output"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );
}
