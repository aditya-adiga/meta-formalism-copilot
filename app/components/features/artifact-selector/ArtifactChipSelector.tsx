"use client";

import { useState } from "react";
import type { ArtifactType, BuiltinArtifactType } from "@/app/lib/types/session";
import { ARTIFACT_META, SELECTABLE_ARTIFACT_TYPES } from "@/app/lib/types/artifacts";
import type { CustomArtifactTypeDefinition } from "@/app/lib/types/customArtifact";
import { isCustomType } from "@/app/lib/types/customArtifact";
import ArtifactTypeModal from "./ArtifactTypeModal";
import CustomTypeDesigner from "./CustomTypeDesigner";

function ChipSpinner() {
  return (
    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-inherit">
      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </span>
  );
}

function ArtifactChip({ label, isActive, isLoading, disabled, dashed, onClick }: {
  label: string;
  isActive: boolean;
  isLoading: boolean;
  disabled: boolean;
  dashed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        relative inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm
        transition-colors duration-150 border
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        ${
          isActive
            ? "bg-[var(--ink-black)] text-[var(--ivory-cream)] border-[var(--ink-black)]"
            : `bg-transparent text-[var(--ink-black)] border-[var(--border-light)] hover:border-[var(--ink-black)]${dashed && !isActive ? " border-dashed" : ""}`
        }
      `}
    >
      {isLoading && <ChipSpinner />}
      <span className={isLoading ? "invisible" : ""}>{label}</span>
    </button>
  );
}

type ArtifactChipSelectorProps = {
  selected: ArtifactType[];
  onChange: (types: ArtifactType[]) => void;
  loading?: Partial<Record<ArtifactType, boolean>>;
  disabled?: boolean;
  customTypes?: CustomArtifactTypeDefinition[];
  onCreateCustomType?: (def: CustomArtifactTypeDefinition) => void;
  onEditCustomType?: (def: CustomArtifactTypeDefinition) => void;
  onDeleteCustomType?: (id: string) => void;
  sourceText?: string;
  contextText?: string;
};

export default function ArtifactChipSelector({
  selected,
  onChange,
  loading = {},
  disabled = false,
  customTypes = [],
  onCreateCustomType,
  onEditCustomType,
  onDeleteCustomType,
  sourceText,
  contextText,
}: ArtifactChipSelectorProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [editingDef, setEditingDef] = useState<CustomArtifactTypeDefinition | undefined>();

  function toggle(type: ArtifactType) {
    if (disabled) return;
    if (selected.includes(type)) {
      onChange(selected.filter((t) => t !== type));
    } else {
      onChange([...selected, type]);
    }
  }

  const selectedDescriptions = selected.map((type) => {
    if (isCustomType(type)) {
      const def = customTypes.find((ct) => ct.id === type);
      return def ? { type, chipLabel: def.chipLabel, description: def.description } : null;
    }
    const meta = ARTIFACT_META[type as BuiltinArtifactType];
    if (meta && SELECTABLE_ARTIFACT_TYPES.includes(type as BuiltinArtifactType)) {
      return { type, chipLabel: meta.chipLabel, description: meta.description };
    }
    return null;
  }).filter(Boolean) as Array<{ type: ArtifactType; chipLabel: string; description: string }>;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-[#6B6560]">
          Select the output types appropriate for your text and use case.{" "}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="text-[#6B6560] hover:text-[var(--ink-black)] underline transition-colors cursor-pointer"
          >
            Click here to learn about different formalisms
          </button>
        </p>

        <div className="flex flex-wrap gap-2">
          {SELECTABLE_ARTIFACT_TYPES.map((type) => (
            <ArtifactChip
              key={type}
              label={ARTIFACT_META[type].chipLabel}
              isActive={selected.includes(type)}
              isLoading={loading[type] ?? false}
              disabled={disabled}
              onClick={() => toggle(type)}
            />
          ))}

          {customTypes.map((ct) => (
            <ArtifactChip
              key={ct.id}
              label={ct.chipLabel}
              isActive={selected.includes(ct.id)}
              isLoading={loading[ct.id] ?? false}
              disabled={disabled}
              dashed
              onClick={() => toggle(ct.id)}
            />
          ))}

          {onCreateCustomType && (
            <button
              type="button"
              onClick={() => { setEditingDef(undefined); setDesignerOpen(true); }}
              disabled={disabled}
              className={`
                inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm
                transition-colors duration-150 border border-dashed border-[#9A9590]
                text-[#9A9590] hover:border-[var(--ink-black)] hover:text-[var(--ink-black)]
                ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
              `}
            >
              + Custom
            </button>
          )}
        </div>

        {selectedDescriptions.length > 0 && (
          <ul className="flex flex-col gap-0.5 mt-0.5">
            {selectedDescriptions.map(({ type, chipLabel, description }) => (
              <li key={type} className="text-xs text-[#6B6560]">
                <span className="font-medium text-[var(--ink-black)]">{chipLabel}:</span>{" "}
                {description}
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
          customTypes={customTypes}
          onEditCustomType={onEditCustomType ? (def) => {
            setModalOpen(false);
            setEditingDef(def);
            setDesignerOpen(true);
          } : undefined}
          onDeleteCustomType={onDeleteCustomType}
        />
      )}

      {designerOpen && onCreateCustomType && (
        <CustomTypeDesigner
          onSave={(def) => {
            if (editingDef) {
              onEditCustomType?.(def);
            } else {
              onCreateCustomType(def);
            }
            setDesignerOpen(false);
            setEditingDef(undefined);
          }}
          onClose={() => { setDesignerOpen(false); setEditingDef(undefined); }}
          sourceText={sourceText}
          contextText={contextText}
          existingDef={editingDef}
        />
      )}
    </>
  );
}
