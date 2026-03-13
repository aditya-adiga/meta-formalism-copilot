"use client";

import type { ArtifactType } from "@/app/lib/types/session";
import { ARTIFACT_META, SELECTABLE_ARTIFACT_TYPES } from "@/app/lib/types/artifacts";

type ArtifactChipSelectorProps = {
  selected: ArtifactType[];
  onChange: (types: ArtifactType[]) => void;
  loading?: Partial<Record<ArtifactType, boolean>>;
  disabled?: boolean;
};

export default function ArtifactChipSelector({
  selected,
  onChange,
  loading = {},
  disabled = false,
}: ArtifactChipSelectorProps) {
  function toggle(type: ArtifactType) {
    if (disabled) return;
    if (selected.includes(type)) {
      onChange(selected.filter((t) => t !== type));
    } else {
      onChange([...selected, type]);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {SELECTABLE_ARTIFACT_TYPES.map((type) => {
        const isActive = selected.includes(type);
        const isLoading = loading[type] ?? false;

        return (
          <button
            key={type}
            type="button"
            onClick={() => toggle(type)}
            disabled={disabled}
            className={`
              relative inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm
              transition-colors duration-150 border
              ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
              ${
                isActive
                  ? "bg-[var(--ink-black)] text-[var(--ivory-cream)] border-[var(--ink-black)]"
                  : "bg-transparent text-[var(--ink-black)] border-[var(--border-light)] hover:border-[var(--ink-black)]"
              }
            `}
          >
            {isLoading && (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-inherit">
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              </span>
            )}
            <span className={isLoading ? "invisible" : ""}>
              {ARTIFACT_META[type].chipLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}
