import { useCallback } from "react";

/**
 * Provides updateField and updateArrayItem helpers for editing
 * structured artifact JSON. Centralizes the spread + serialize pattern
 * used by all artifact panel EditableSection onChange handlers.
 */
export function useFieldUpdaters(
  data: object | null,
  onContentChange?: (json: string) => void,
) {
  const updateField = useCallback((key: string, value: unknown) => {
    if (!data || !onContentChange) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic key access on a known-structured object
    if ((data as any)[key] === value) return;
    onContentChange(JSON.stringify({ ...data, [key]: value }));
  }, [data, onContentChange]);

  const updateArrayItem = useCallback((key: string, index: number, value: unknown) => {
    if (!data || !onContentChange) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic key access on a known-structured object
    const arr = (data as any)[key];
    if (arr[index] === value) return;
    const updated = [...arr];
    updated[index] = value;
    onContentChange(JSON.stringify({ ...data, [key]: updated }));
  }, [data, onContentChange]);

  return { updateField, updateArrayItem };
}
