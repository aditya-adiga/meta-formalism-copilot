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
    <div className="absolute bottom-6 left-1/2 z-50 w-[calc(100%-4rem)] max-w-xl -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-full bg-[var(--ink-black)] px-6 py-3 shadow-lg transition-shadow duration-200 hover:shadow-xl">
        <input
          ref={inputRef}
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Make changes to entire output... e.g., make it more concise"
          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-white placeholder-white/70 focus:outline-none"
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
