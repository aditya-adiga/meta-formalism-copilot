"use client";

type TextInputProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function TextInput({ value, onChange }: TextInputProps) {
  return (
    <div className="flex flex-col">
      <textarea
        id="text-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste or type your source material here..."
        rows={5}
        className="w-full resize-y rounded-md border border-[#DDD9D5] bg-[var(--ivory-cream)] px-4 py-3 text-[var(--ink-black)] placeholder-[#9A9590] shadow-md transition-shadow duration-200 focus:border-[var(--ink-black)] focus:caret-black focus:outline-none focus:ring-1 focus:ring-[var(--ink-black)] focus:shadow-lg"
        style={{ lineHeight: 1.7, caretColor: "#000000" }}
      />
    </div>
  );
}
