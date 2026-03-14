"use client";

import { useEffect } from "react";
import type { ArtifactType } from "@/app/lib/types/session";
import { ARTIFACT_META, SELECTABLE_ARTIFACT_TYPES } from "@/app/lib/types/artifacts";

type ArtifactTypeModalProps = {
  selected: ArtifactType[];
  onChange: (types: ArtifactType[]) => void;
  onClose: () => void;
};

export default function ArtifactTypeModal({
  selected,
  onChange,
  onClose,
}: ArtifactTypeModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function toggle(type: ArtifactType) {
    if (selected.includes(type)) {
      onChange(selected.filter((t) => t !== type));
    } else {
      onChange([...selected, type]);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="mx-4 max-w-lg w-full rounded-lg border border-[#DDD9D5] bg-white p-5 shadow-xl"
        style={{ fontFamily: "var(--font-serif, 'EB Garamond', serif)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--ink-black)]">
            Choose Formalization Types
          </h2>
          <button
            onClick={onClose}
            className="text-[#6B6560] hover:text-[var(--ink-black)] transition-colors text-xl leading-none px-1"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {SELECTABLE_ARTIFACT_TYPES.map((type) => {
            const meta = ARTIFACT_META[type];
            const isActive = selected.includes(type);

            return (
              <button
                key={type}
                type="button"
                onClick={() => toggle(type)}
                className={`
                  text-left rounded-lg border p-3 transition-colors duration-150 cursor-pointer
                  ${
                    isActive
                      ? "border-[var(--ink-black)] bg-[var(--ink-black)]/5"
                      : "border-[#DDD9D5] hover:border-[var(--ink-black)]"
                  }
                `}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`
                      inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
                      ${
                        isActive
                          ? "bg-[var(--ink-black)] text-[var(--ivory-cream)]"
                          : "bg-[#F5F1ED] text-[var(--ink-black)]"
                      }
                    `}
                  >
                    {meta.chipLabel}
                  </span>
                </div>
                <p className="text-sm text-[var(--ink-black)] mb-1">
                  {meta.description}
                </p>
                <p className="text-xs text-[#6B6560]">
                  <span className="font-medium">When to use:</span> {meta.whenToUse}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
