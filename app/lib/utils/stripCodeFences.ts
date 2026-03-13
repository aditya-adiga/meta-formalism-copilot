/** Strip markdown code fences if present, regardless of language tag. */
export function stripCodeFences(raw: string): string {
  const fenced = raw.match(/```(?:\w*)?[\r\n]([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  return raw.trim();
}
