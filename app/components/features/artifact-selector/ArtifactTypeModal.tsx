"use client";

import { useEffect } from "react";
import type { ArtifactType } from "@/app/lib/types/session";
import { ARTIFACT_META, SELECTABLE_ARTIFACT_TYPES } from "@/app/lib/types/artifacts";
import type { CustomArtifactTypeDefinition } from "@/app/lib/types/customArtifact";

type ArtifactTypeModalProps = {
  selected: ArtifactType[];
  onChange: (types: ArtifactType[]) => void;
  onClose: () => void;
  customTypes?: CustomArtifactTypeDefinition[];
  onEditCustomType?: (def: CustomArtifactTypeDefinition) => void;
  onDeleteCustomType?: (id: string) => void;
};

export default function ArtifactTypeModal({
  selected,
  onChange,
  onClose,
  customTypes = [],
  onEditCustomType,
  onDeleteCustomType,
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
        className="mx-4 max-w-lg w-full max-h-[85vh] rounded-lg border border-[#DDD9D5] bg-white p-5 shadow-xl flex flex-col"
        style={{ fontFamily: "var(--font-serif, 'EB Garamond', serif)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className="text-lg font-semibold text-[var(--ink-black)]">
            Choose Output Types
          </h2>
          <button
            onClick={onClose}
            className="text-[#6B6560] hover:text-[var(--ink-black)] transition-colors text-xl leading-none px-1"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto">
          {/* Built-in types */}
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

          {/* Custom types section */}
          {customTypes.length > 0 && (
            <>
              <div className="border-t border-[#DDD9D5] pt-3 mt-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">Custom Types</h3>
              </div>
              {customTypes.map((ct) => {
                const isActive = selected.includes(ct.id);

                return (
                  <div
                    key={ct.id}
                    className={`
                      text-left rounded-lg border p-3 transition-colors duration-150
                      ${
                        isActive
                          ? "border-[var(--ink-black)] bg-[var(--ink-black)]/5"
                          : "border-[#DDD9D5] border-dashed hover:border-[var(--ink-black)]"
                      }
                    `}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(ct.id)}
                      className="w-full text-left cursor-pointer"
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
                          {ct.chipLabel}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--ink-black)] mb-1">
                        {ct.description}
                      </p>
                      {ct.whenToUse && (
                        <p className="text-xs text-[#6B6560]">
                          <span className="font-medium">When to use:</span> {ct.whenToUse}
                        </p>
                      )}
                    </button>
                    <div className="flex gap-2 mt-2">
                      {onEditCustomType && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onEditCustomType(ct); }}
                          className="text-xs text-[#6B6560] hover:text-[var(--ink-black)] underline cursor-pointer"
                        >
                          Edit
                        </button>
                      )}
                      {onDeleteCustomType && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete "${ct.name}"? This will also remove any generated output.`)) {
                              onDeleteCustomType(ct.id);
                            }
                          }}
                          className="text-xs text-red-500 hover:text-red-700 underline cursor-pointer"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
