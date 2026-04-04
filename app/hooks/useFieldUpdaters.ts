import { useCallback, useRef } from "react";

/**
 * Provides updateField and updateArrayItem helpers for editing
 * structured artifact JSON. Centralizes the spread + serialize pattern
 * used by all artifact panel EditableSection onChange handlers.
 *
 * Uses a ref for `data` so callbacks are stable across re-renders,
 * avoiding unnecessary re-creation of EditableSection onChange handlers.
 */
export function useFieldUpdaters(
  data: object | null,
  onContentChange?: (json: string) => void,
) {
  const dataRef = useRef(data);
  dataRef.current = data;

  const updateField = useCallback((key: string, value: unknown) => {
    if (!dataRef.current || !onContentChange) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic key access on a known-structured object
    if ((dataRef.current as any)[key] === value) return;
    onContentChange(JSON.stringify({ ...dataRef.current, [key]: value }));
  }, [onContentChange]);

  const updateArrayItem = useCallback((key: string, index: number, value: unknown) => {
    if (!dataRef.current || !onContentChange) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic key access on a known-structured object
    const arr = (dataRef.current as any)[key];
    if (arr[index] === value) return;
    const updated = [...arr];
    updated[index] = value;
    onContentChange(JSON.stringify({ ...dataRef.current, [key]: updated }));
  }, [onContentChange]);

  return { updateField, updateArrayItem };
}
