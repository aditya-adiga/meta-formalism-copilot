"use client";

import { useState } from "react";
import type { ArtifactType } from "@/app/lib/types/session";
import { ARTIFACT_META, SELECTABLE_ARTIFACT_TYPES } from "@/app/lib/types/artifacts";
import ArtifactTypeModal from "./ArtifactTypeModal";

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
  const [modalOpen, setModalOpen] = useState(false);

  function toggle(type: ArtifactType) {
    if (disabled) return;
    if (selected.includes(type)) {
      onChange(selected.filter((t) => t !== type));
    } else {
      onChange([...selected, type]);
    }
  }

  const selectedSelectable = selected.filter((t) =>
    SELECTABLE_ARTIFACT_TYPES.includes(t)
  );

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="self-start text-sm text-[#6B6560] hover:text-[var(--ink-black)] underline transition-colors cursor-pointer"
        >
          Learn about each type
        </button>

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

        {selectedSelectable.length > 0 && (
          <ul className="flex flex-col gap-0.5 mt-0.5">
            {selectedSelectable.map((type) => (
              <li key={type} className="text-xs text-[#6B6560]">
                <span className="font-medium text-[var(--ink-black)]">
                  {ARTIFACT_META[type].chipLabel}:
                </span>{" "}
                {ARTIFACT_META[type].description}
              </li>
            ))}
          </ul>
        )}
      </div>

      {modalOpen && (
        <ArtifactTypeModal
          selected={selected}
          onChange={onChange}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
